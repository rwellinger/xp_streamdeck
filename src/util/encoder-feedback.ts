/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import streamDeck, { type DialAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

/** Encoder strip feedback: label above value (custom layout, no icon). */
export async function setDialFeedback<T extends JsonObject>(
	action: DialAction<T>,
	label: string,
	value: string,
): Promise<void> {
	try {
		await action.setFeedback({ label: label || " ", value: value || " " });
	} catch (err) {
		streamDeck.logger.warn("encoder-feedback: setFeedback failed", err);
	}
}
