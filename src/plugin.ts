/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import streamDeck from "@elgato/streamdeck";

import { XPlaneBackground } from "./actions/background";
import { XPlaneCommand } from "./actions/command";
import { XPlaneCommandDisplay } from "./actions/command-display";
import { XPlaneDataRefDisplay } from "./actions/dataref-display";
import { XPlaneDataRefLamp } from "./actions/dataref-lamp";
import { XPlaneDataRefSwitch } from "./actions/dataref-switch";
import { XPlaneDataRefToggle } from "./actions/dataref-toggle";
import { XPlaneDataRefWrite } from "./actions/dataref-write";
import { XPlaneDisplaySelector } from "./actions/display-selector";
import { XPlaneEncoder } from "./actions/encoder";
import { XPlaneGuardedCommand } from "./actions/guarded-command";
import { XPlaneGuardedDataRef } from "./actions/guarded-dataref";
import { XPlaneMacro } from "./actions/macro";
import { XPlaneMultiDataRefDisplay } from "./actions/multi-dataref-display";
import { XPlaneRotary } from "./actions/rotary";
import { XPlaneRotaryDataRef } from "./actions/rotary-dataref";
import { XPlaneWindDisplay } from "./actions/wind-display";
import { selectors } from "./selectors/registry";
import { XPlaneClient } from "./xplane";

streamDeck.logger.setLevel("info");

const xplane = new XPlaneClient({ logger: streamDeck.logger });

xplane.on("connected", () => streamDeck.logger.info("X-Plane: connected"));
xplane.on("disconnected", () => streamDeck.logger.info("X-Plane: disconnected"));
xplane.on("error", (err) => streamDeck.logger.warn("X-Plane: error", err));

selectors.init().catch((err) => streamDeck.logger.warn("selectors: init failed", err));

streamDeck.actions.registerAction(new XPlaneCommand(xplane));
streamDeck.actions.registerAction(new XPlaneCommandDisplay(xplane));
streamDeck.actions.registerAction(new XPlaneGuardedCommand(xplane));
streamDeck.actions.registerAction(new XPlaneGuardedDataRef(xplane));
streamDeck.actions.registerAction(new XPlaneRotary(xplane));
streamDeck.actions.registerAction(new XPlaneRotaryDataRef(xplane));
streamDeck.actions.registerAction(new XPlaneEncoder(xplane));
streamDeck.actions.registerAction(new XPlaneDataRefDisplay(xplane));
streamDeck.actions.registerAction(new XPlaneMultiDataRefDisplay(xplane));
streamDeck.actions.registerAction(new XPlaneDataRefWrite(xplane));
streamDeck.actions.registerAction(new XPlaneDataRefToggle(xplane));
streamDeck.actions.registerAction(new XPlaneDataRefLamp(xplane));
streamDeck.actions.registerAction(new XPlaneDataRefSwitch(xplane));
streamDeck.actions.registerAction(new XPlaneMacro(xplane));
streamDeck.actions.registerAction(new XPlaneWindDisplay(xplane));
streamDeck.actions.registerAction(new XPlaneBackground());
streamDeck.actions.registerAction(new XPlaneDisplaySelector());

xplane.connect();
streamDeck.connect().catch((err) => streamDeck.logger.error("streamDeck.connect failed", err));
