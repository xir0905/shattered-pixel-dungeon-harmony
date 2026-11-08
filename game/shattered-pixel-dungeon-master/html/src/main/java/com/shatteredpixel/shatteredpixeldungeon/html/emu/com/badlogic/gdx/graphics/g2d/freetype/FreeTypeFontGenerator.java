package com.badlogic.gdx.graphics.g2d.freetype;

import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.PixmapPacker;

/**
 * GWT stub of gdx-freetype's FreeTypeFontGenerator for Shattered Pixel
 * Dungeon's web port. FreeType cannot run in the browser; the html module's
 * HtmlPlatformSupport overrides every code path that would actually use a
 * generator (getFont), producing fonts via the Canvas 2D API instead. The
 * stub exists so that the shared base class PlatformSupport (which declares
 * freetype types in its API and fields) can be compiled by GWT. Instances of
 * this class are used as identity keys in the PlatformSupport.fonts map.
 */
public class FreeTypeFontGenerator {

	public FreeTypeFontGenerator() {
	}

	/** Matches the real freetype ctor signature; the font file is ignored. */
	public FreeTypeFontGenerator(FileHandle fontPath) {
	}

	public BitmapFont generateFont(FreeTypeFontParameter parameter) {
		throw new UnsupportedOperationException("FreeType is not available in the web build");
	}

	public void dispose() {
	}

	/** Font smoothing algorithm. */
	public enum Hinting {
		None,
		Slight,
		Medium,
		Full,
		AutoSlight,
		AutoMedium,
		AutoFull,
	}

	/** Mirrors the fields of gdx-freetype's FreeTypeFontParameter that the
	 * shared game code touches. */
	public static class FreeTypeFontParameter {
		public int size = 16;
		public boolean mono;
		public Hinting hinting = Hinting.AutoMedium;
		public int renderCount = 2;
		public float borderWidth = 0;
		public boolean borderStraight = false;
		public float borderGamma = 1.8f;
		public int shadowOffsetX = 0;
		public int shadowOffsetY = 0;
		public int spaceX, spaceY;
		public int padTop, padLeft, padBottom, padRight;
		public String characters = "";
		public boolean kerning = true;
		public PixmapPacker packer = null;
		public boolean flip = false;
		public boolean genMipMaps = false;
		public boolean incremental;
	}
}
