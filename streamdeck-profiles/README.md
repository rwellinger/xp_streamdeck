# Stream Deck Profiles #

> [!IMPORTANT]  
> The Streamdeck profiles in the following library only work together with the [xp_streamdesk Plugin](../README.md).

## Sync via `make` ##

Do **not** import/export these profiles through the Stream Deck UI — it creates
"Copy" duplicates with fresh UUIDs and breaks the cross-profile links in the
parent `X-Plane` profile.

* `make export` — snapshot live profiles (`xp_stream_*` and the `X-Plane`
  parent) from `~/Library/Application Support/com.elgato.StreamDeck/ProfilesV3/`
  into this directory.
* `make import` — restore every `*.streamDeckProfile` in this directory back
  into `ProfilesV3/`, patching `Device.UUID` to the local Stream Deck hardware
  so it works on any Mac (dev laptop ↔ sim Mac).

Both commands quit and relaunch the Stream Deck app automatically. Folder
UUIDs are preserved, so the parent profile's child links stay intact.

### First-time setup on a new Mac

If the target Mac already has profiles with the same names but different
folder UUIDs (e.g. previously imported through the Stream Deck UI), the first
`make import` will produce **duplicates** — the old profiles stay, the new
ones from the repo land next to them. This is a one-time situation.

To clean it up:

1. In the Stream Deck app, delete every `xp_stream_*` profile **and** the
   `X-Plane` parent profile.
2. Run `make import`.
3. Open the `X-Plane` parent and re-link the one tile that points to Stream
   Deck's system "Default Profile" — that profile is intentionally not synced
   and has a different UUID on every Mac.

From then on every `git pull && make import` overwrites the same folder UUIDs
in place — no more duplicates, no more re-linking.

### Adding a new profile

Adding a new aircraft profile (e.g. B738):

1. **In the Stream Deck app:** create the new profile and name it
   `xp_stream_<aircraft>` — e.g. `xp_stream_b738`. The lowercase
   `xp_stream_` prefix is required; the sync filter ignores anything else.
2. Configure the pages and buttons.
3. In the `X-Plane` parent profile, add a new "Switch Profile" tile that
   points to the new profile.
4. Run `make export` and select **both** the new profile *and*
   `xp_stream_parent` — otherwise the sim Mac won't know about the link.
5. *(Optional)* add a `## <Aircraft>` block with features to this README.
6. Commit on a feature branch, open a PR, merge.

On the sim Mac: `git pull && make import` picks up the new profile and the
updated parent automatically — the new tile works on first launch because
folder UUIDs are preserved across machines.

## Streamdeck Models Support ##

Streamdeck models currently supported by the profiles:

> [!NOTE]  
> Stream Deck MK2 and Stream Deck 3 profiles are still under development, you can check profiles compatibility here.

| **Profile** | Streamdeck XL (4x8) | Streamdeck MK2 & Streamdeck 3 (3x15) |
| --- | --- | --- |
| **G1000 - X-Plane Default X1000 (G1000)** | ✅ | ❌ |
| **Cessna 172 SP by X-Plane** | ✅ | ✅ |
| **Cirrus SR22** | ✅ | ❌ |
| **Lancair Evolution** | ✅ | ❌ |
| **VAN's VR10** | ✅ | ❌ |
| **Piper PA-46 M500 by X-Aerodynamics** | ✅ | ❌ |
| **Diamond DA42 and DA62 by Aerobask** | ✅ | ❌ |
| **Diamond DA20 / DV20 by Aerobask** | ✅ | ❌ |
| **UL Shark by Aerobask** | ✅ | ❌ |
| **Phenom 300 by Aerobask** | ✅ | ❌ |
| **Pilatus PC12 by Thranda (G1000 Version)** | ✅ | ❌ |
| **EuroCopter EC130 (Garmin 430 Edition)** | ✅ | ❌ |
| **AW-109 SP 2.0** | ✅ | ❌ |
| **AW139 by x-rotors.com** | ✅ | ❌ |
| **Guimbal Cabri G2** | ✅ | ❌ |
| **T-6A Texan II by AOA** | ✅ | ❌ |
| **T-7A Red Hawk by AOA** | ✅ | ❌ |
| **BN-2A Islander by Thranda** | ✅ | ❌ |
| **EuroFOX** | ✅ | ❌ |
| **Toliss Airbus Family** | ❌ | ✅ |

> [!TIP]  
> You can open Streamdeck 3 or Streamdeck MK2 profiles on Streamdeck XL without problems, but if you open Streamdeck XL profiles on Streamdeck 3 or Streamdeck MK2 the profiles would appear cropped.

## Phone & Tablet Profiles ##

Profiles for the Stream Deck Mobile app on a phone or tablet — no physical deck
required. They cover the avionics side (Garmin 430/530, G1000, FMS, autopilot)
and are meant to run *alongside* a hardware deck, not to replace an aircraft
profile.

Directory: `Phone or Tablet/` — see its own [README](<Phone or Tablet/README.md>)
for the author's notes. Created and contributed by **PetiLoco123**.

| **Profile** | Layout |
| --- | --- |
| `XP H G530 G1000` | horizontal |
| `XP V G1000 FMS` | vertical |
| `XP V G530 FMS` | vertical |
| `XP V G530 G1000 FMS` | vertical |

> [!NOTE]  
> These are not part of the default `make export` / `make import` run (which
> targets `StreamDeck XL`). Import them with the mobile device paired via
> `make import DIR="Phone or Tablet"`, so the archives get stamped onto that
> device instead of the hardware deck.

## X-Plane Menu Profile

This is a default Profile where all profiles are included. Required to link all profiles together. The import/export mechanism supports this on the sync.

Filename: xp_stream_parent.streamDeckProfile

## Default X1000 (G1000) ##

Filename: xp_stream_g1000.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Garmin Default Autopilot
* PFD and MFD Support
* GCU (Alpha & Numeric)
* Cockpit Views


## Cessna 172 SP ##

Filename: xp_stream_c172sp.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views

## Cirrus SR22 ##

Filename: xp_stream_sr22.streamDeckProfile

Plugin Version Required: 1.4.3.0 or newer

### Features: ###

* Default Cockpit Buttons
* Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views

## Lancair Evolution ##

The aircraft from "Austin Meyer"

Filename: xp_stream_lancair.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views


## VAN's VR10 ##

Filename: xp_stream_rv10.streamDeckProfile

Plugin Version Required: 1.4.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views


## Piper PA-46 M500 ##

Filename: xp_stream_pa46.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Full Overhead Panel
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views

## Diamond DA42 and DA62 ##

Filename: xp_stream_da42.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Default Cockpit Buttons
* Garmin Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Cockpit Views


## Diamond DA20 / DV20 by Aerobask ##

Filename: xp_stream_dv20.streamDeckProfile

Plugin Version Required: 1.4.1.0 or newer

### Features: ###

* Default Cockpit Buttons
* DV20 Autopilot
* Garmin 430 Support
* Skyview Touch Support
* Cockpit Views



## UL Shark ##

Filename: xp_stream_shark.streamDeckProfile

Plugin Version Required: 1.3.1.0 or newer

### Features: ###

* Default Cockpit Buttons
* DV20 Autopilot
* Garmin 430 Support
* Skyview Touch Support
* Cockpit Views

## Phenom 300 ##

Filename: xp_stream_ph300.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* Phenom Cockpit Buttons
* Phenom Autopilot
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Ground Procedures (Cold&Dark)
* Cockpit Views

## Pilatus PC12 by Thranda (G1000 Version) ##

I use the PC12 from Thranda in G1000 Configuration on the Mac because better experience with the MAP and Flight Planning.

Filename: xp_stream_pc12.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* PC12 Overhead and Cockpit Buttons
* PC12 Autopilot
* Shows some Engine indicators
* X1000 (X-Plane G1000)
* GCU for G1000 (Alpha & Numeric)
* Ground Procedures (Cold&Dark)
* Cockpit Views

## EuroCopter EC130 (Garmin 430 Edition) ##

Filename: xp_stream_ec130.streamDeckProfile

Plugin Version Required: 1.3.0.0 or newer

### Features: ###

* EC130 Cockpit Buttons
* EC130 and Hover Assistent Autopilot Support
* Shows some Engine indicators
* Garmin 430 Support
* Ground Procedures (Cold&Dark)
* Cockpit Views

## AW-109 SP 2.0

Filename: xp_stream_aw109.streamDeckProfile

Plugin Version Required: 1.4.3.0 or newer (Uses the new Display Selector)

### Features: ###

* AW109 Cockpit Buttons
* AW109 Autopilot
* Overhead and Ground
* Shows some Engine indicators
* Ground Procedures (Cold&Dark)
* Cockpit Views

## AW139 by x-rotors.com

The AW139 from [x-rotors.com](https://www.x-rotors.com/).

Filename: xp_stream_aw139.streamDeckProfile

Plugin Version Required: 1.7.1.0 or newer

### Features: ###

* AW139 Overhead and Cockpit Buttons (Electrics, Fuel, Pumps, X-Feed, Ext Power)
* Engine Start (Igniter 1/2, OEI TNG, RPM 101%)
* AFCS Autopilot (AP1/AP2, CPL, SAS/ATT, HDG, NAV, ALT/ALTA, VS, IAS, APP, BC, HOV, RHT, DCL, Force Trim)
* CCD Cursor Control (arrows, ENTER, dial coarse/fine)
* Shows some Engine indicators and Wind Display
* Master Warning / Caution Reset
* Ground Procedures (Cold&Dark)
* Cockpit Views (Quick Looks)

## Guimbal Cabri G2

Filename: xp_stream_gabri_g2.streamDeckProfile

Plugin Version Required: 1.4.3.0 or newer (Uses the new Display Selector)

### Features: ###

* G2 Cockpit Buttons
* G2 Autopilot
* Shows some Engine indicators
* Ground Procedures (Cold&Dark)
* Cockpit Views

## T-6A Texan II by AOA
I love this from the PC9 adapted airplane. The Cockpit Profile is not yet finish.
Autopilot is missing as I have to findd out how it really works.
The DataRef Data is not so unfriendly designed by AOA.

Filename: xp_stream_t6a.streamDeckProfile

Plugin Version Required: 1.4.4.0 or newer (Uses the new Display Selector)

### Features: ###

* T6A Cockpit Buttons
* G1000 MFD integrated
* Ground Procedures (Cold&Dark)
* Cockpit Views

## T-7A Red Hawk by AOA

The successor to the T-6A — this profile has a working autopilot page.

Filename: xp_stream_t7a.streamDeckProfile

Plugin Version Required: 1.7.1.0 or newer

### Features: ###

* T7A Cockpit Buttons (BAT, AVI, GEN, APU, Starter, Fuel Cutoff, Canopy, Brakes)
* Lights (NAV, BCN, STROBE, LANDING)
* Oxygen Panel (EMER / MAX / SUPPLY) and GCAS
* Autopilot (FD / Servos, HDG, APR, ALT, VS)
* G1000 PFD/MFD integrated (Softkeys, FMS, Range, Popup)
* GCU 478 (Alpha & Numeric)
* Master Warning / Caution Reset
* Wind Display
* Ground Procedures (Cold&Dark)
* Cockpit Views (Quick Looks)

## BN-2A Islander by Thranda

Filename: xp_stream_bn2a_th.streamDeckProfile

Plugin Version Required: 1.6.2.0 or newer

### Features: ###

* Overhead
* All Buttons for BN2
* Garmin 430 Support (on GARMIN only)
* Ground Procedures (Cold&Dark)
* Transponder
* Cockpit Views


## EuroFOX ##

Filename: xp_stream_eurofox.streamDeckProfile

Plugin Version Required: 1.7.1.0 or newer

### Features: ###

* Default Cockpit Buttons (Battery, Avionics, Boost Pump, Parking Brake, Flaps)
* Ignition A / B (Magnetos)
* Lights (NAV, LAND, STROBE)
* Autopilot (Servo, ALT Hold, Pitch / Roll Override)
* Garmin 430 Support
* Transponder
* Wind Display
* Ground Procedures (Cold&Dark)
* Cockpit Views (Quick Looks)

## Toliss Airbus Family ##

Streamdeck profile for all twinjet Toliss Airbus aircrafts.

> [!NOTE]  
> The Toliss A340 is not currently fully supported since it was created for twinjet Airbus aircrafts (Two fire handles, fuel systems...).

> [!NOTE]  
> This profile was created and tested with the A320 Neo, some systems may not match aircrafts that are not from A320 family like the A330, for example, the Hydraulics.

Filename: xp_stream_airbus_toliss.streamDeckProfile

Plugin Version Required: 1.4.3.0 or newer (Uses the new Multi-Action / Macro to hold agents buttons)

### Features: ###

* Animated Gear
* CPLDC
* ECAM
* XPDR equipment
* Ground handling
* Fire panel

Full list of integrated panels:

* MASTER WARNING
* MASTER CAUTION
* ECAM
* GEAR
* LIGHTS
* ELEC
* CPDLC
* ADIRS
* FCU & EFIS
* FUEL & FIRE
* TCAS & XPDR
* HYD
* GROUND
* RADIO

> [!IMPORTANT]  
> Engine Fire annunciators: light only when fire is detected, remain on after
  extinguishing (dataref limitation).
> APU Fire annunciators function correctly.
> Agent discharge status unavailable.
> The Fire annunciators don't illuminate during testing.
> **Toliss uses some kind of internal logic and lacks of datarefs, this makes the above features not available**
