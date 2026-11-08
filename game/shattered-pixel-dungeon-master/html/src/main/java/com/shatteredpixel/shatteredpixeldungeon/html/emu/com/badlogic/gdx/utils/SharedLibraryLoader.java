package com.badlogic.gdx.utils;

/**
 * Emulation of libGDX's SharedLibraryLoader for the GWT web port of Shattered
 * Pixel Dungeon. There are no native libraries in a browser build, so the
 * static os field is null: com.watabou.utils.DeviceCompat reports neither
 * desktop nor Android/iOS, which is the correct answer for a web build.
 */
public class SharedLibraryLoader {

	public static final Os os = null;
}
