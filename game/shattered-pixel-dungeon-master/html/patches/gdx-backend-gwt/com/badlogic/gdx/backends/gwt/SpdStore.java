/*******************************************************************************
 * Copyright 2011 See AUTHORS file.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

package com.badlogic.gdx.backends.gwt;

import java.util.ArrayList;
import java.util.HashSet;

import com.google.gwt.storage.client.Storage;

/**
 * PATCHED for Shattered Pixel Dungeon (HarmonyOS port, C-8 save persistence):
 * synchronous storage facade used by {@link LocalStorageFileHandle}.
 *
 * On HarmonyOS the WebView DOM storage lives in a separate render process
 * whose on-disk flush is lazy; when the system reclaims that process (e.g.
 * lock screen), unflushed writes are lost, and a cold start exposed an
 * empty-store window where the game briefly saw "no saves" while the old
 * state loaded asynchronously (see spec/savegame-loss.md).
 *
 * This facade therefore routes every read/write primarily through a
 * synchronous ArkTS bridge injected as <code>window.spdNative</code>
 * (see SpdNativeStore in entry/src/main/ets/pages/Index.ets), which persists
 * each key as an fsynced file under <code>&lt;filesDir&gt;/spd-store</code>
 * inside the app process. The browser localStorage remains as migration
 * source, fallback and secondary copy:
 * <ul>
 * <li>reads: bridge first; on miss fall back to localStorage and lazily
 * promote the found value into the bridge (idempotent migration);</li>
 * <li>writes: bridge + localStorage (double write);</li>
 * <li>deletes: bridge + localStorage (double delete, so a deleted save can
 * never be resurrected from a stale localStorage copy);</li>
 * <li>key enumeration: union of both backends.</li>
 * </ul>
 *
 * Every bridge call is JSNI guarded by an availability probe and try/catch,
 * so in a plain browser (no spdNative) the facade degrades gracefully to
 * pure localStorage — the pre-C-8 behavior.
 */
public class SpdStore {

	/** Separates keys in the joined string returned by spdKeys(). Chosen
	 * because it can never appear in gdx storage keys (file paths). */
	private static final String KEY_SEP = "\u0001";

	private static Boolean bridgeAvailable;

	private static native boolean nativeAvailable () /*-{
		try {
			return !!($wnd.spdNative && $wnd.spdNative.spdPut);
		} catch (e) {
			return false;
		}
	}-*/;

	private static native void nativePut (String key, String value) /*-{
		try { $wnd.spdNative.spdPut(key, value); } catch (e) {}
	}-*/;

	private static native boolean nativeExists (String key) /*-{
		try { return $wnd.spdNative.spdExists(key); } catch (e) { return false; }
	}-*/;

	private static native String nativeGet (String key) /*-{
		try { return $wnd.spdNative.spdGet(key); } catch (e) { return null; }
	}-*/;

	private static native void nativeDel (String key) /*-{
		try { $wnd.spdNative.spdDel(key); } catch (e) {}
	}-*/;

	/** All bridge keys joined with {@link #KEY_SEP}; null when unavailable,
	 * possibly empty when the bridge store has no entries yet. */
	private static native String nativeKeys () /*-{
		try { return $wnd.spdNative.spdKeys(); } catch (e) { return null; }
	}-*/;

	private static Storage ls () {
		return GwtFiles.LocalStorage;
	}

	private static boolean bridge () {
		if (bridgeAvailable == null) {
			bridgeAvailable = Boolean.valueOf(nativeAvailable());
		}
		return bridgeAvailable.booleanValue();
	}

	/** True when at least one backend (bridge or localStorage) is usable. */
	public static boolean anyAvailable () {
		return bridge() || ls() != null;
	}

	public static String getItem (String key) {
		if (bridge()) {
			if (nativeExists(key)) return nativeGet(key);
			//bridge miss: try the legacy localStorage copy and, when found,
			//promote it into the native store so future reads hit the bridge
			Storage s = ls();
			if (s == null) return null;
			String legacy = s.getItem(key);
			if (legacy != null) nativePut(key, legacy);
			return legacy;
		}
		Storage s = ls();
		return s == null ? null : s.getItem(key);
	}

	public static void setItem (String key, String value) {
		if (bridge()) nativePut(key, value);
		Storage s = ls();
		if (s != null) s.setItem(key, value);
	}

	public static void removeItem (String key) {
		if (bridge()) nativeDel(key);
		Storage s = ls();
		if (s != null) s.removeItem(key);
	}

	/** All keys present in either backend, bridge keys first, deduplicated. */
	public static ArrayList<String> keys () {
		HashSet<String> seen = new HashSet<String>();
		ArrayList<String> out = new ArrayList<String>();
		if (bridge()) {
			String joined = nativeKeys();
			if (joined != null && joined.length() > 0) {
				String[] parts = joined.split(KEY_SEP);
				for (String k : parts) {
					if (k.length() > 0 && !seen.contains(k)) {
						seen.add(k);
						out.add(k);
					}
				}
			}
		}
		Storage s = ls();
		if (s != null) {
			for (int i = 0; i < s.getLength(); i++) {
				String k = s.key(i);
				if (k != null && !seen.contains(k)) {
					seen.add(k);
					out.add(k);
				}
			}
		}
		return out;
	}
}
