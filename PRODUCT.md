# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** the owner-builder (Landon), an experienced builder turning a bare 6th-gen Camaro shell into a road-race car. Knows the car well; uses the app to plan, research, track the build, and identify parts.
- **Secondary:** helpers / crew who know the car less well. They need to find a part, see where it goes on the car, read its torque specs and install steps, and recognise the physical part in their hands — without knowing the system jargon first.

## Product Purpose

An interactive 3D build guide for one specific car: a 2016–2024 (Gen 6, GM Alpha platform) Camaro road-race build from a bare chassis. Every system, part, fastener and torque spec is placed on a 3D model so the builder knows what goes where, can identify components, and can look things up while building. Success = in the garage, someone can go from "what is this / where does this go / what does it torque to" to the answer in seconds.

## Positioning

Not a parts catalogue or a forum thread: one car, every part in its real place on a real ZL1 1LE body, with factory vs race options, per-fastener torque with honest confidence labels, schematics, and a build tracker.

## Operating Context

- Laptop/desktop for planning and research; phone or tablet next to the car while wrenching (greasy hands, quick lookups, comparing a part in hand to the 3D model). Both are first-class.
- Organization: **system first, then physical location** — e.g. Suspension › Front Left › every part at that corner. Few, clear groups per system rather than many subsystems.
- Build happens in 11 phases from bare chassis prep to setup.
- Progress (status, chosen option, notes) is stored per browser; backup/restore JSON.

## Capabilities and Constraints

- 843 parts in 13 systems, ~840 hardware entries, 43 schematics, 176 3D line routes; data in `data/systems/**`, merged by `scripts/build-data.mjs`.
- Procedural part models (`src/parts/**`) placed in car coordinates (meters; x rearward from front axle, y up, z = left/driver side); reference body is the ZL1 1LE mesh (`public/models/camaro.glb`), real panels in `body-parts.glb`.
- Torque values carry confidence: verified / typical / estimate. Must stay visible — builders torque real bolts from this.
- Static site (Vite + Three.js), deployed to GitHub Pages from `docs/`.

## Evidence on Hand

Research data with sources and `modelRef` reference links per part. Many parts have no part number on file and many dimensions are estimated — never present estimates as verified.

## Product Principles

1. Location is truth: every part is findable by where it physically sits on the car.
2. Answers in seconds, at the car: the most common lookups (what is it, where, torque, steps) are one or two taps away on a phone.
3. Honest data: confidence and estimates are always labelled.
4. The 3D car is the map: list and model stay linked both ways.
5. Plain language first, jargon second, so helpers can use it.
