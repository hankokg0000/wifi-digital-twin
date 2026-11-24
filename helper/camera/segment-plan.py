import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image


MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
OBJECTS = [
    ("shelf", "store shelf", 0.27),
    ("desk", "office desk", 0.29),
    ("chair", "office chair", 0.29),
]


def input_tensor(source, size):
    pixels = np.asarray(source.resize((size, size), Image.Resampling.BILINEAR), dtype=np.float32) / 255
    return ((pixels - MEAN) / STD).transpose(2, 0, 1)[None, ...]


def tokenized_prompt(vocab, prompts):
    ids = [vocab["[CLS]"]]
    spans = []
    for kind, phrase, minimum in prompts:
        start = len(ids)
        for word in phrase.split():
            pieces = ["check", "##out"] if word == "checkout" else [word]
            ids.extend(vocab[piece] for piece in pieces)
        spans.append((kind, start, len(ids), minimum))
        ids.append(vocab["."])
    return np.array([[*ids, vocab["[SEP]"]]], dtype=np.int64), spans


def overlap(box, other):
    left, top, right, bottom = box
    x1, y1, x2, y2 = other
    intersection = max(0, min(right, x2) - max(left, x1)) * max(0, min(bottom, y2) - max(top, y1))
    return intersection / ((right - left) * (bottom - top) + (x2 - x1) * (y2 - y1) - intersection)


def objects_in_image(session, vocab, source, prompts):
    tokens, spans = tokenized_prompt(vocab, prompts)
    logits, centers = session.run(["logits", "pred_boxes"], {
        "pixel_values": input_tensor(source, 800),
        "input_ids": tokens,
        "token_type_ids": np.zeros(tokens.shape, dtype=np.int64),
        "attention_mask": np.ones(tokens.shape, dtype=np.int64),
        "pixel_mask": np.ones((1, 800, 800), dtype=np.int64),
    })
    scores = 1 / (1 + np.exp(-np.clip(logits[0], -80, 80)))
    candidates = []
    for row, (x, y, width, height) in zip(scores, centers[0]):
        if width < 0.035 or height < 0.035 or width * height > 0.65:
            continue
        kind, confidence, minimum = max(
            ((kind, float(row[start:end].mean()), minimum) for kind, start, end, minimum in spans),
            key=lambda candidate: candidate[1],
        )
        box = [max(0, float(x - width / 2)), max(0, float(y - height / 2)),
               min(1, float(x + width / 2)), min(1, float(y + height / 2))]
        if confidence >= minimum and box[0] < box[2] and box[1] < box[3]:
            candidates.append({"kind": kind, "box": box, "confidence": confidence})
    return candidates


def locate_objects(model_dir, source, options, shelves_present, reference):
    vocab = {token: index for index, token in enumerate((model_dir / "vocab.txt").read_text().splitlines())}
    session = ort.InferenceSession(
        str(model_dir / "grounding.onnx"), sess_options=options, providers=["CPUExecutionProvider"],
    )
    candidates = objects_in_image(session, vocab, source, OBJECTS)
    if shelves_present:
        # Focused prompts retain fixtures when large shelves dominate the whole-frame prediction.
        width, height = source.size
        x1, y1, x2, y2 = int(width * 0.14), int(height * 0.29), int(width * 0.88), height
        prompts = (("counter", "checkout counter", 0.25), ("basket", "wire basket", 0.27))
        for prompt in prompts:
            candidates.extend(objects_in_image(session, vocab, source, [prompt]))
        frames = [source, reference] if reference is not None else [source]
        for frame in frames:
            detail = frame.crop((x1, y1, x2, y2))
            focused = prompts if frame is source else (("counter", "store counter", 0.28),)
            for prompt in focused:
                for candidate in objects_in_image(session, vocab, detail, [prompt]):
                    left, top, right, bottom = candidate["box"]
                    candidate["box"] = [(x1 + left * (x2 - x1)) / width, (y1 + top * (y2 - y1)) / height,
                                        (x1 + right * (x2 - x1)) / width, (y1 + bottom * (y2 - y1)) / height]
                    candidates.append(candidate)

    results = []
    for candidate in sorted(candidates, key=lambda item: -item["confidence"]):
        if len(results) >= 18:
            break
        if all(overlap(candidate["box"], old["box"]) < 0.45 for old in results):
            results.append(candidate)
    return results


def semantic_session(model_dir):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.log_severity_level = 3
    options.inter_op_num_threads = 1
    return ort.InferenceSession(str(model_dir / "segformer.onnx"), sess_options=options,
                                providers=["CPUExecutionProvider"]), options


def labels_for_image(session, source, width, height):
    logits = session.run(None, {session.get_inputs()[0].name: input_tensor(source, 512)})[0][0]
    indexed = Image.fromarray(np.argmax(logits, axis=0).astype(np.uint8))
    return np.asarray(indexed.resize((width, height), Image.Resampling.NEAREST)).reshape(-1)


def segment(model_dir, path, width, height, reference_path):
    session, options = semantic_session(model_dir)
    source = Image.frombytes("RGB", (width, height), path.read_bytes())
    reference = Image.frombytes("RGB", (width, height), reference_path.read_bytes()) if reference_path else None
    labels = labels_for_image(session, source, width, height)
    with (model_dir / "labels.json").open() as config:
        names = json.load(config)["id2label"]
    shelf_id = int(next(key for key, label in names.items() if label == "shelf"))
    shelves_present = np.count_nonzero(labels == shelf_id) >= labels.size * 0.16
    return {"names": names, "labels": labels.tolist(), "objects": locate_objects(model_dir, source, options, shelves_present, reference)}


if __name__ == "__main__":
    model_dir, path, width, height, *reference = sys.argv[1:]
    still = Path(reference[0]) if reference else None
    json.dump(segment(Path(model_dir), Path(path), int(width), int(height), still), sys.stdout, separators=(",", ":"))
