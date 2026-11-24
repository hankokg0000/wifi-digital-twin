import json
import runpy
import sys
from pathlib import Path

import numpy as np
import pycolmap as colmap
from PIL import Image

LABELS = {
    "floor": "floor", "rug": "floor", "wall": "wall", "windowpane": "wall",
    "door": "door", "shelf": "shelf", "bookcase": "shelf", "counter": "counter",
    "countertop": "counter", "chair": "chair", "swivel chair": "chair", "armchair": "chair",
    "table": "desk", "desk": "desk", "basket": "basket", "cabinet": "unknown", "sofa": "sofa",
    "bed": "unknown", "wardrobe": "unknown", "refrigerator": "unknown", "case": "unknown",
}


def locate(frame_dir, cache):
    database = cache / "matches.db"
    options = colmap.FeatureExtractionOptions(max_image_size=760, num_threads=4, use_gpu=False)
    options.sift.max_num_features = 2600
    colmap.extract_features(database, frame_dir, camera_mode=colmap.CameraMode.SINGLE,
                            reader_options=colmap.ImageReaderOptions(camera_model="SIMPLE_RADIAL"),
                            extraction_options=options, device=colmap.Device.cpu)
    matching = colmap.FeatureMatchingOptions(num_threads=4, use_gpu=False)
    colmap.match_sequential(database, matching_options=matching,
                            pairing_options=colmap.SequentialPairingOptions(overlap=9, quadratic_overlap=True, num_threads=4),
                            device=colmap.Device.cpu)
    (cache / "models").mkdir()
    models = colmap.incremental_mapping(database, frame_dir, cache / "models",
                                        options=colmap.IncrementalPipelineOptions(
                                            min_model_size=4, num_threads=4, random_seed=11,
                                            extract_colors=False, multiple_models=False))
    if not models:
        return {"registered": 0, "selected": []}
    model = max(models.values(), key=lambda m: (m.num_reg_images(), m.num_points3D()))
    model_dir = cache / "selected-model"
    model_dir.mkdir()
    model.write(model_dir)
    images = sorted((model.images[i] for i in model.reg_image_ids()), key=lambda image: image.name)
    selected = []
    for window in np.array_split(np.arange(len(images)), min(11, len(images))):
        index = max(window, key=lambda i: images[i].num_points3D - abs(i - int(window[len(window)//2])) * 16)
        selected.append(images[index].name)
    return {"registered": len(images), "selected": selected}


def fit_depth(samples, depths, rng):
    if len(samples) < 22 or np.ptp(samples) < 1e-5:
        return None
    inv = 1 / depths
    tolerance = max(np.median(inv) * 0.17, 1e-6)
    best = None
    quality = 0
    for i, j in rng.integers(len(samples), size=(100, 2)):
        span = samples[i] - samples[j]
        if abs(span) < np.ptp(samples) * 0.07:
            continue
        slope = (inv[i] - inv[j]) / span
        if slope <= 0:
            continue
        intercept = inv[i] - slope * samples[i]
        inliers = np.abs(inv - (slope * samples + intercept)) < tolerance
        score = np.count_nonzero(inliers)
        if score > quality:
            best, quality = inliers, score
    if best is None or quality < max(16, len(samples) * 0.37):
        return None
    slope, intercept = np.polyfit(samples[best], inv[best], 1)
    return (slope, intercept) if slope > 0 else None


def surface_cloud(image, camera, reconstruction, data, size, labels, rng):
    width, height = size
    extrinsic = image.cam_from_world()
    rotation, translation = extrinsic.rotation.matrix(), extrinsic.translation
    support = [point for point in image.points2D
               if point.has_point3D() and reconstruction.points3D[point.point3D_id].error < 2.0]
    if len(support) < 22:
        return None
    pixels = np.asarray([point.xy for point in support])
    points = np.asarray([reconstruction.points3D[point.point3D_id].xyz for point in support])
    z = (points @ rotation.T + translation)[:, 2]
    pixels = pixels / np.array([camera.width, camera.height])
    px = np.clip((pixels[:, 0] * width).astype(int), 0, width - 1)
    py = np.clip((pixels[:, 1] * height).astype(int), 0, height - 1)
    relative = data[py * width + px]
    good = np.isfinite(relative) & (z > 0.001)
    fit = fit_depth(relative[good], z[good], rng)
    if fit is None:
        return None

    indexes = np.arange(0, width * height, 2)
    uv = np.column_stack(((indexes % width + 0.5) / width, (indexes // width + 0.5) / height))
    inv = data[indexes] * fit[0] + fit[1]
    median = np.median(z[good])
    use = labels[indexes] > 0
    use &= np.isfinite(inv) & (inv > 1 / (median * 3.4)) & (inv < 1 / (median * 0.22))
    pixels = uv[use] * np.array([camera.width, camera.height])
    rays = camera.cam_from_img(pixels)
    depth = 1 / inv[use]
    camera_points = np.column_stack((rays * depth[:, None], depth))
    world = (camera_points - translation) @ rotation
    return world, labels[indexes][use], uv[use]


def robust_floor(points, cameras, rng):
    if len(points) < 80:
        return None
    cloud = points[::max(1, len(points)//2200)]
    spread = np.linalg.norm(np.quantile(cloud, 0.9, axis=0) - np.quantile(cloud, 0.1, axis=0))
    if spread < 0.01:
        return None
    tolerance = spread * 0.033
    camera_center = np.mean(cameras, axis=0)
    best = None
    highest = 0
    for a, b, c in rng.integers(len(cloud), size=(180, 3)):
        norm = np.cross(cloud[b] - cloud[a], cloud[c] - cloud[a])
        size = np.linalg.norm(norm)
        if size < spread * spread * 0.004:
            continue
        norm /= size
        if (camera_center - cloud[a]) @ norm < 0:
            norm = -norm
        signed = (cameras - cloud[a]) @ norm
        if np.quantile(signed, 0.1) <= tolerance or np.quantile(signed, 0.9) - np.quantile(signed, 0.1) > spread * 0.48:
            continue
        keep = np.abs((cloud - cloud[a]) @ norm) < tolerance
        score = np.count_nonzero(keep)
        if score > highest:
            best, highest = keep, score
    if best is None or highest < max(45, len(cloud) * 0.25):
        return None
    sample = cloud[best]
    center = sample.mean(axis=0)
    _, _, basis = np.linalg.svd(sample - center, full_matrices=False)
    up = basis[-1]
    if (camera_center - center) @ up < 0:
        up = -up
    return center, up, tolerance


def floor_axes(up, wall_points, center):
    seed = np.eye(3)[np.argmin(np.abs(up))]
    horizontal = np.cross(up, seed)
    horizontal /= np.linalg.norm(horizontal)
    forward = np.cross(horizontal, up)
    if len(wall_points) < 35:
        return horizontal, forward

    wall = (wall_points - center) @ np.column_stack((horizontal, forward))
    extent = np.quantile(wall, 0.9, axis=0) - np.quantile(wall, 0.1, axis=0)
    tolerance = max(np.max(extent) * 0.035, 1e-6)
    probe = wall[::max(1, len(wall)//750)]
    best = np.array([1.0, 0.0])
    score = 0
    for angle in np.linspace(0, np.pi/2, 48, endpoint=False):
        basis = np.array([np.cos(angle), np.sin(angle)])
        normal = np.array([-basis[1], basis[0]])
        counts = []
        for axis in (basis, normal):
            projected = probe @ axis
            bins = np.floor((projected - projected.min()) / tolerance).astype(int)
            counts.append(np.bincount(bins).max())
        if sum(counts) > score:
            best, score = basis, sum(counts)
    x = horizontal * best[0] + forward * best[1]
    return x, np.cross(x, up)


def footprint(kind, points):
    xz = points[:, [0, 2]]
    center = np.median(xz, axis=0)
    _, _, axes = np.linalg.svd(xz - center, full_matrices=False)
    principal, second = axes
    shape = (xz - center) @ axes.T
    low, high = np.quantile(shape, [0.08, 0.92], axis=0)
    width, length = high - low
    height = np.quantile(points[:, 1], 0.86)
    if width < 0.16 or height < 0.18 or length < 0.05:
        return None
    center = center + axes.T @ ((high + low) / 2)
    return {"kind": kind, "center": center.tolist(), "width": float(width),
            "length": float(max(length, 0.13)), "height": float(min(height, 4.0)),
            "rotation": float(-np.arctan2(principal[1], principal[0]))}


def models_for_cloud(points, labels, views, kinds):
    models = []
    for kind, id_value in kinds.items():
        if kind in ("floor", "wall", "door"):
            continue
        keep = (labels == id_value) & (points[:, 1] > 0.12) & (points[:, 1] < 4)
        cluster, frames = points[keep], views[keep]
        if len(cluster) < 35:
            continue
        cells = np.floor(cluster[:, [0, 2]] / 0.32).astype(int)
        buckets = {}
        for i, cell in enumerate(cells):
            buckets.setdefault(tuple(cell), []).append(i)
        while buckets:
            start = next(iter(buckets))
            chain = [start]
            members = buckets.pop(start)
            for u, v in chain:
                for neighbor in [(u+1,v),(u-1,v),(u,v+1),(u,v-1)]:
                    if neighbor in buckets:
                        members.extend(buckets.pop(neighbor))
                        chain.append(neighbor)
            if len(members) < 35 or len(set(frames[members])) < 2:
                continue
            model = footprint(kind, cluster[members])
            if model and model["width"] < 5.0:
                models.append(model)
    return sorted(models, key=lambda item: -item["width"] * item["length"])[:26]


def fit_door(points, uv, seconds):
    if len(points) < 35:
        return None
    xz = points[:, [0, 2]]
    center = np.median(xz, axis=0)
    _, _, axes = np.linalg.svd(xz - center, full_matrices=False)
    projected = (xz - center) @ axes.T
    low, high = np.quantile(projected, [0.08, 0.92], axis=0)
    width, thickness = high - low
    vertical = np.ptp(np.quantile(points[:, 1], [0.08, 0.92]))
    if width < 0.34 or width > 2.8 or thickness > width * 0.48 or vertical < width * 1.12:
        return None
    center += axes[1] * np.median(projected[:, 1])
    box_min, box_max = np.quantile(uv, [0.01, 0.99], axis=0)
    # Cropped door edges would underestimate the reference width.
    if box_min[0] < 0.03 or box_max[0] > 0.97:
        return None
    return {"from": (center + low[0] * axes[0]).tolist(), "to": (center + high[0] * axes[0]).tolist(),
            "frameSeconds": seconds, "imageBox": [*box_min.tolist(), *box_max.tolist()]}


def interpret(frames, cache, model_dir, depth_width, depth_height, fps):
    selection = json.loads((cache / "frames.json").read_text())
    rng = np.random.default_rng(2729)
    reconstruction = colmap.Reconstruction(cache / "selected-model")
    raw_names = json.loads((model_dir / "labels.json").read_text())["id2label"]
    kinds = {name: i+1 for i, name in enumerate(dict.fromkeys(LABELS.values()))}
    semantic_lookup = np.zeros(256, dtype=int)
    for index, name in raw_names.items():
        semantic_lookup[int(index)] = kinds.get(LABELS.get(name.split(",")[0].strip()), 0)
    semantic = runpy.run_path(str(Path(__file__).with_name("segment-plan.py")))
    session, _ = semantic["semantic_session"](model_dir)

    clouds = []
    cameras = []
    selected = set(selection)
    for image in reconstruction.images.values():
        if image.name not in selected:
            continue
        image_path = frames / image.name
        depth_path = cache / f"{image_path.stem}.json"
        with Image.open(image_path) as picture:
            labels = semantic_lookup[semantic["labels_for_image"](session, picture.convert("RGB"), depth_width, depth_height)]
        data = np.asarray(json.loads(depth_path.read_text()), dtype=float)
        found = surface_cloud(image, reconstruction.cameras[image.camera_id], reconstruction, data,
                              (depth_width, depth_height), labels, rng)
        if found is not None and len(found[0]) >= 40:
            clouds.append((*found, (int(image_path.stem) - 1) / fps))
            cameras.append(image.projection_center())

    if len(clouds) < 2:
        return {"plan": None, "doors": [], "observedSides": 0}
    world = np.concatenate([item[0] for item in clouds])
    labels = np.concatenate([item[1] for item in clouds])
    cameras = np.asarray(cameras)
    fitted = robust_floor(world[labels == kinds["floor"]], cameras, rng)
    if fitted is None:
        return {"plan": None, "doors": [], "observedSides": 0}
    center, up, tolerance = fitted
    axis, forward = floor_axes(up, world[np.isin(labels, [kinds["wall"], kinds["door"]])], center)
    basis = np.column_stack((axis, up, forward))
    raw = (world - center) @ basis
    floor = raw[(labels == kinds["floor"]) & (np.abs(raw[:, 1]) < tolerance * 1.6)]
    if len(floor) < 50:
        return {"plan": None, "doors": [], "observedSides": 0}
    limits = np.quantile(floor[:, [0, 2]], [0.015, 0.985], axis=0)
    span = np.max(limits[1] - limits[0])
    if span < 0.02 or np.min(limits[1] - limits[0]) < span * 0.12:
        return {"plan": None, "doors": [], "observedSides": 0}
    multiplier = 7.0 / span
    origin = (limits[0] + limits[1]) / 2
    floor = (floor[:, [0, 2]] - origin) * multiplier
    plan_points = raw * multiplier
    plan_points[:, [0, 2]] -= origin * multiplier
    views = np.concatenate([np.full(len(item[0]), index) for index, item in enumerate(clouds)])

    low, high = (limits - origin) * multiplier
    wall_mask = np.isin(labels, [kinds["wall"], kinds["door"]])
    wall_points = plan_points[wall_mask & (plan_points[:, 1] > 0.08) & (plan_points[:, 1] < 5), :]
    # Extend the floor outline only to nearby wall evidence, keeping far hallways out.
    for column, coordinate in enumerate([0, 2]):
        other = 2 if coordinate == 0 else 0
        eligible = wall_points[(wall_points[:, other] >= low[1-column] - 0.45) &
                               (wall_points[:, other] <= high[1-column] + 0.45), coordinate]
        for side, target in [(0, low), (1, high)]:
            edge = target[column]
            near = eligible[np.abs(eligible - edge) < 0.88]
            if len(near) >= 35:
                target[column] = min(edge, np.quantile(near, 0.18)) if side == 0 else max(edge, np.quantile(near, 0.82))

    left, front = low.tolist()
    right, back = high.tolist()
    corners = [[left, front], [right, front], [right, back], [left, back]]
    walls = []
    observed = 0
    for index, start in enumerate(corners):
        end = corners[(index+1)%4]
        axis_index = 1 if start[0] == end[0] else 0
        other = 1 - axis_index
        xz = wall_points[:, [0, 2]]
        on_edge = xz[np.abs(xz[:, other] - start[other]) < 0.48, axis_index]
        lo, hi = sorted([start[axis_index], end[axis_index]])
        on_edge = on_edge[(on_edge >= lo-0.15) & (on_edge <= hi+0.15)]
        if len(on_edge) >= 60:
            coverage = np.quantile(on_edge, 0.9) - np.quantile(on_edge, 0.1)
            observed += int(coverage > (hi-lo) * 0.44)
        else:
            coverage = 0
        walls.append({"from": start, "to": end, "inferred": bool(coverage <= (hi-lo) * 0.44)})

    room = (plan_points[:, 0] >= left-0.18) & (plan_points[:, 0] <= right+0.18)
    room &= (plan_points[:, 2] >= front-0.18) & (plan_points[:, 2] <= back+0.18)
    objects = models_for_cloud(plan_points[room], labels[room], views[room], kinds)
    doors = []
    for index, (cloud, code, uv, seconds) in enumerate(clouds):
        keep = (views == index) & room & (labels == kinds["door"])
        mask = (code == kinds["door"]) & room[views == index]
        door = fit_door(plan_points[keep], uv[mask], seconds)
        if door and all(np.linalg.norm(np.mean([door["from"], door["to"]], axis=0) -
                                    np.mean([old["from"], old["to"]], axis=0)) > 0.55 for old in doors):
            doors.append({"id": f"d{len(doors)+1}", **door})
    plane_low, plane_high = np.quantile(floor, [0.02, 0.98], axis=0)
    visible = [[plane_low[0], plane_low[1]], [plane_high[0], plane_low[1]],
               [plane_high[0], plane_high[1]], [plane_low[0], plane_high[1]]]
    return {"plan": {"version": 1, "bounds": [left, front, right, back], "visibleFloor": visible,
                     "walls": walls, "objects": objects}, "doors": doors, "observedSides": observed}


if __name__ == "__main__":
    action, frames, cache, *args = sys.argv[1:]
    frames, cache = Path(frames), Path(cache)
    colmap.logging.set_log_destination(colmap.logging.INFO, "")
    if action == "locate":
        report = locate(frames, cache)
    else:
        model_dir, width, height, fps = args
        report = interpret(frames, cache, Path(model_dir), int(width), int(height), float(fps))
    print(json.dumps(report, separators=(",", ":"), allow_nan=False))
