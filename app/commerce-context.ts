"use client";

import { createContext } from "react";
import type { DemoStore } from "./CommerceDemoContext";

// Keep context identity independent of provider and hook hot updates.
// This module contains no runtime dependency on the provider module.
export const CommerceContext = createContext<DemoStore | null>(null);
