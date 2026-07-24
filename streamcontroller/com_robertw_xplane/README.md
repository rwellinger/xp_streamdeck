# X-Plane for StreamController

Linux StreamController plugin mirroring the core of [`xp_streamdeck`](https://github.com/4SLSL/xp_streamdeck): talk to **X-Plane 12** via the native Web API on `localhost:8086`.

Ship / install catalog: this repository doubles as a personal StreamController store (`Plugins.json`).

## Actions (v0.2)

| Action | Inputs | Role |
| --- | --- | --- |
| **Command** | Key, Dial | Activate a CommandRef |
| **DataRef Display** | Key, Dial | Live DataRef readout |
| **Encoder** | Dial (Key for CW step) | Rotate / click / shift — DataRef step (linear or octal) or CW/CCW commands |
| **Rotary** | Key, Dial | Directional step or Command; optional Min/Max/**Cycle** DataRef grid |

## Install

### From this store (recommended)

1. In StreamController, add a custom plugin URL:
   `https://github.com/4SLSL/xp-sdcontroller`
2. Or point a private store at this repo’s `Plugins.json` (same format as the [official Store](https://github.com/StreamController/StreamController-Store)).

### Local symlink (dev)

```bash
ln -s /path/to/xp-sdcontroller \
      /path/to/StreamController/data/plugins/com_robertw_xplane
```

Enable a FakeDeck (Settings → Developer) if you have no hardware. Restart StreamController; pick actions under **X-Plane**.

Requires X-Plane 12.1.1+ with Web API enabled.

## Rotary + Cycle

Set **Delta** > 0 and a **DataRef Path**. **Direction** chooses the sign (`right`/`up` = +, `left`/`down` = −). With **Min**, **Max**, and **Cycle** enabled, values wrap on the discrete grid (`min…max` by `|delta|`). Leave Delta at 0 to fire **Command Path** instead.

## Parity roadmap

Still to port from the Elgato plugin: Toggle, Switch, Guarded, Lamp, Macro, Wind, Multi-Display, selectors, WebSocket subscriptions (~10 Hz) instead of `on_tick` polling.

## Docs

- StreamController plugins: <https://streamcontroller.github.io/docs/latest/plugin_dev/intro/>
- X-Plane Web API: <https://developer.x-plane.com/article/x-plane-web-api/>
