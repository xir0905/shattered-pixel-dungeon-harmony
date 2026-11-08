package com.badlogic.gdx.utils;

/**
 * Emulation of libGDX's Os enum for the GWT web port of Shattered Pixel
 * Dungeon. The real Os source is not shipped in the gdx sources jar (and is
 * excluded from GWT compilation); this subset carries the constants that
 * com.watabou.utils.DeviceCompat compares against.
 */
public enum Os {
	Windows,
	Linux,
	MacOsX,
	Android,
	IOS,
	Unknown
}
