# WiFi Digital Twin

A digital twin of a home that detects people and their activity from WiFi signals (plus cameras where allowed), including in rooms no sensor can see directly.

## Language

### Sensing

**WiFi Sensing**:
Inferring what people and pets are doing from how their bodies disturb WiFi signals between devices, without them carrying any device. The core capability of this project.
_Avoid_: WiFi tracking, WiFi localization (those imply following a carried phone), WLAN sensing (fine in literature, not in our code/UI)

**Device Tracking**:
Locating a person by the phone or wearable they carry. Not part of WiFi Sensing; out of scope unless explicitly added.
_Avoid_: Calling it WiFi Sensing

**Non-line-of-sight Detection**:
Knowing that someone is present or moving in a space that no sensor has a direct view of, because WiFi signals between devices pass through the walls of that space.
_Avoid_: Through-wall scan, seeing through walls, WiFi imaging

**Link**:
One transmitter→receiver WiFi path whose signal is observed over time; the basic unit of WiFi sensing.
_Avoid_: Connection, channel, beam

**Transmitter**:
The device sending the WiFi signal on a Link — in the Pilot Deployment, the home's existing router.
_Avoid_: AP (when meaning its sensing role), source

**Receiver**:
The device measuring the WiFi signal on a Link — in the Pilot Deployment, a laptop (or Android phone) reading signal strength.
_Avoid_: Sensor (too broad), client

**Reading**:
One timestamped measurement of a Link's signal (signal strength in the Pilot Deployment).
_Avoid_: Sample, data point, scan

**Virtual Link**:
A Link placed on the twin's floor plan whose Readings are produced by the simulator from Simulated Activity, so detection can be developed and scored against the simulator's exact positions before real devices exist. Its Readings feed the same detection as a real Link's.
_Avoid_: Mock link, fake sensor

**Monitored Room**:
The room a Link is placed to watch; its Transmitter and Receiver are positioned so the Link's Coverage falls within that room, even if the devices themselves sit outside it.
_Avoid_: Target, zone (zone means a restricted area)

**Coverage**:
The region a Link's signal travels through closely enough that a moving person there changes its Readings.
_Avoid_: Range, field of view

**Motion Detection**:
A yes/no verdict, per time window, on whether something is moving in a Monitored Room, inferred from how much a Link's Readings fluctuate. It cannot tell a person from a pet, and "no motion" never means "empty" — a sleeping or fallen person is still.
_Avoid_: Presence detection (presence includes people sitting still), occupancy, "room empty"

**Ground Truth**:
The simulator's exact record of who is where and moving when. For Motion Detection, the correct answer is whether anything is moving anywhere in the Monitored Room — not just near the Link.
_Avoid_: Real data (that is Observed Activity), label

**Test Session**:
A period of recording a real Link's Readings while a tester records what is actually happening, used to score Observed Activity.
_Avoid_: Experiment, run

**Activity Mark**:
A timestamped mark the tester enters during a Test Session ("walking", "still", "left the room"); the real-world counterpart of Ground Truth.
_Avoid_: Label, annotation, ground truth (reserved for the simulator)

**Missed Detection**:
A time window where Ground Truth has motion in the Monitored Room but Motion Detection said no.
_Avoid_: False negative (fine in metrics code, not in UI/docs)

**False Alarm**:
A time window where Motion Detection said yes but nothing was moving in the Monitored Room.
_Avoid_: False positive (fine in metrics code, not in UI/docs)

**Zone**:
A restricted area that applies to people, pets or anything. Evidence that cannot tell people from pets (such as Motion Detection) can only trigger Zones that apply to anything.
_Avoid_: Restricted room (a Zone may be part of a room), area

**Baseline**:
A recording of a Link's Readings while its Monitored Room is known to be empty, defining how much the signal fluctuates on its own; Motion Detection compares against it. Re-recorded whenever a device moves.
_Avoid_: Calibration (reserved for tuning wall materials), noise floor

### Alerts

**Alert**:
A notification that something needs attention (a Zone entered, a fall). Every Alert carries its **Source** — Simulated or Observed — shown on it, and Observed Alerts can be filtered on their own.
_Avoid_: Event (too broad), notification (fine in UI copy only)

### Twin roles

**Placement Plan**:
The twin's suggested positions for a Link's Transmitter and Receiver so that its Coverage falls within the intended Monitored Room.
_Avoid_: Site survey (that means measuring real signal), layout

**Live Mirror**:
The twin showing real Motion Detection verdicts on the matching Monitored Room as they happen, alongside any simulated activity.
_Avoid_: Dashboard, real-time view

**Simulated Activity**:
People, pets and events generated by the twin's simulator. Always shown as simulated.
_Avoid_: Fake, demo data

**Observed Activity**:
Anything the twin shows because real WiFi Sensing reported it. Must always be visibly labelled as real, so it is never mistaken for Simulated Activity when both are on screen.
_Avoid_: Live data, actual, ground truth (ground truth means the simulator's exact positions)

### Deployments

**Pilot Deployment**:
A test setup covering one small room with a single WiFi transmitter, used to validate sensing before scaling up.
_Avoid_: POC, demo setup

**Home Deployment**:
A setup whose number and placement of devices scales with the size and layout of the whole home.
_Avoid_: Production, full install
