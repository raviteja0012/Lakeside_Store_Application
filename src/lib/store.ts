"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Active store context. The picker in the header writes the selected store id to
// localStorage and broadcasts a change so every store-aware screen rescopes its reads.
// Until multi-store data lands, the store list has a single row and this is a no-op filter.

export const STORE_KEY = "rgs_store";
export const STORE_EVENT = "rgs_store_changed";

export type StoreLite = { id: string; name: string };

export function getActiveStore(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORE_KEY);
}

export function setActiveStore(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEY, id);
  window.dispatchEvent(new CustomEvent(STORE_EVENT, { detail: id }));
}

// Hook for screens that scope their data to one store. Returns the active store id once
// resolved (null while loading or if no store exists) and the full store list for pickers.
export function useActiveStore() {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("store").select("id, name").order("name");
      const list = (data as StoreLite[]) || [];
      if (!alive) return;
      setStores(list);
      const saved = getActiveStore();
      const valid = saved && list.some((s) => s.id === saved) ? saved : list[0]?.id || null;
      if (saved !== valid && valid && typeof window !== "undefined") localStorage.setItem(STORE_KEY, valid);
      setStoreId(valid);
      setReady(true);
    })();

    const onChange = (e: Event) => {
      const id = (e as CustomEvent).detail as string;
      setStoreId(id);
    };
    window.addEventListener(STORE_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(STORE_EVENT, onChange);
    };
  }, []);

  return { stores, storeId, ready, setStore: setActiveStore };
}
