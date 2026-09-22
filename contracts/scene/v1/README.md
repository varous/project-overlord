# Scene contract v1

`scene.schema.json` is the JSON Schema (draft 2020-12) for a `SceneDoc`, the single versioned record
from which every view is derived. A scene carries its WGS84 anchor, its element-type references, its
zones and named viewpoints. `examples/demo-scene.json` is a valid instance used by the web viewer and
by tests; the future Python layout service and the API consume the same contract. Every sourced value
records provenance (`STATED`, `ARCHETYPE`, `MEASURED` or `INFERRED`), and element types are referenced
by `typeCode` from the element-type registry rather than duplicated in the document.

All lengths are integer tenth-millimetres (`tmm`, 1 unit = 0.1 mm = 1e-4 m); areas are integer square
tenth-millimetres. The local site frame is right-handed: the origin is the downstage-centre edge of the
main stage, +Y points toward the audience, +Z is up and +X is stage right (the performer's right hand
when facing the audience). The frame is anchored to WGS84 by an anchor (latitude, longitude and
ellipsoidal height in metres) plus a heading, defined as the clockwise angle in degrees from true north
to local +Y. Display units never enter the document.
