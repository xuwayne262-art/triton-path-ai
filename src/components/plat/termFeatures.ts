"use client";

import { createContext, useContext } from "react";
import type { TermFeatures } from "@/lib/terms";

/**
 * What the quarter on screen publishes — rooms, seat-count times, exact
 * booking links — for the components deep inside a page that show them.
 * The default is Fall 2026's, which has all three; a page showing a quarter
 * without them (Winter 2027's public schedule) provides its own, so a
 * section says "Room unavailable" instead of drawing a blank or a pin.
 */
const TermFeaturesContext = createContext<TermFeatures>({ rooms: true, seatTimes: true, booking: true });

export const TermFeaturesProvider = TermFeaturesContext.Provider;
export const useTermFeatures = () => useContext(TermFeaturesContext);
