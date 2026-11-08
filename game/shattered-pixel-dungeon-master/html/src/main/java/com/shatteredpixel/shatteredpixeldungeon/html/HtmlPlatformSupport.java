/*
 * Pixel Dungeon
 * Copyright (C) 2012-2015 Oleg Dolya
 *
 * Shattered Pixel Dungeon
 * Copyright (C) 2014-2026 Evan Debenham
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 */

package com.shatteredpixel.shatteredpixeldungeon.html;

import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.Texture.TextureFilter;
import com.badlogic.gdx.graphics.g2d.BitmapFont;
import com.badlogic.gdx.graphics.g2d.BitmapFont.BitmapFontData;
import com.badlogic.gdx.graphics.g2d.BitmapFont.Glyph;
import com.badlogic.gdx.graphics.g2d.GlyphLayout.GlyphRun;
import com.badlogic.gdx.graphics.g2d.PixmapPacker;
import com.badlogic.gdx.graphics.g2d.PixmapPacker.PixmapPackerRectangle;
import com.badlogic.gdx.graphics.g2d.TextureRegion;
import com.badlogic.gdx.graphics.g2d.freetype.FreeTypeFontGenerator;
import com.badlogic.gdx.utils.Array;
import com.watabou.noosa.Game;
import com.watabou.utils.PlatformSupport;

import java.util.HashMap;

/**
 * Web (GWT) platform support for Shattered Pixel Dungeon.
 *
 * FreeType cannot run in the browser, so fonts are generated with the
 * Canvas 2D API: glyphs are measured via TextMetrics and rasterized
 * (fillText / strokeText for the outline mode) directly into the GWT
 * emulated Pixmap's canvas, then packed into the shared PixmapPacker
 * atlas exactly like the desktop freetype path does. The metrics math
 * (ascent/down/yoffset/xadvance) mirrors gdx-freetype's
 * FreeTypeFontGenerator so layout is identical across platforms.
 */
public class HtmlPlatformSupport extends PlatformSupport {

	// font families loaded via @font-face in index.html
	private static final String BASIC_FAMILY = "pixel_font, monospace";
	private static final String ASIAN_FAMILY = "droid_sans, sans-serif";

	private static FreeTypeFontGenerator basicFontGenerator;
	private static FreeTypeFontGenerator asianFontGenerator;

	@Override
	public void updateDisplaySize() {
		//the browser canvas resizes automatically via GwtGraphics
	}

	@Override
	public void updateSystemUI() {
		//nothing to do in the browser
	}

	@Override
	public boolean connectedToUnmeteredNetwork() {
		return true; //no metered networks on the web
	}

	@Override
	public boolean supportsVibration() {
		return supportsVibrationJsni();
	}

	@Override
	public void vibrate( int millis ) {
		vibrateJsni( millis );
	}

	/* FONT SUPPORT */

	@Override
	public void setupFontGenerators(int pageSize, boolean systemFont) {
		//don't bother doing anything if nothing has changed
		if (fonts != null && this.pageSize == pageSize && this.systemfont == systemFont) {
			return;
		}
		this.pageSize = pageSize;
		this.systemfont = systemFont;

		resetGenerators(false);
		fonts = new HashMap<>();

		//generators are only used as identity keys in the fonts map,
		//the actual font family is chosen by getFont() below.
		//The real freetype ctor would NPE on a null handle, but this code
		//only ever runs under GWT, where the emu stub's ctor is a no-op.
		if (systemFont) {
			basicFontGenerator = asianFontGenerator = new FreeTypeFontGenerator((FileHandle) null);
		} else {
			basicFontGenerator = new FreeTypeFontGenerator((FileHandle) null);
			asianFontGenerator = new FreeTypeFontGenerator((FileHandle) null);
		}

		fonts.put(basicFontGenerator, new HashMap<Integer, BitmapFont>());
		fonts.put(asianFontGenerator, new HashMap<Integer, BitmapFont>());

		packer = new PixmapPacker(pageSize, pageSize, Pixmap.Format.RGBA8888, 1, false);
	}

	@Override
	protected FreeTypeFontGenerator getGeneratorForString(String input) {
		if (containsAsian(input)) {
			return asianFontGenerator;
		}
		return basicFontGenerator;
	}

	@Override
	public BitmapFont getFont(int size, String text, boolean flipped, boolean border) {
		FreeTypeFontGenerator generator = getGeneratorForString(text);

		if (generator == null || fonts == null) {
			return null;
		}

		int key = size;
		if (border) key += Short.MAX_VALUE; //surely we'll never have a size above 32k
		if (flipped) key = -key;

		HashMap<Integer, BitmapFont> fontsForGenerator = fonts.get(generator);
		if (!fontsForGenerator.containsKey(key)) {
			String family = generator == asianFontGenerator ? ASIAN_FAMILY : BASIC_FAMILY;
			try {
				fontsForGenerator.put(key, generateCanvasFont(family, size, flipped, border));
			} catch (Exception e) {
				Game.reportException(e);
				return null;
			}
		}

		return fontsForGenerator.get(key);
	}

	private BitmapFont generateCanvasFont(String family, int size, boolean flipped, boolean border) {
		float borderWidth = border ? size / 10f : 0f;
		String fontSpec = size + "px " + family;

		float[] fm = new float[5];
		measureFontMetricsJsni(fontSpec, size, fm);
		//fm: [0]=fontBoundingBoxAscent, [1]=fontBoundingBoxDescent,
		//    [2]=capHeight, [3]=xHeight, [4]=space advance

		CanvasFontData data = new CanvasFontData(fontSpec, size, border, borderWidth, fm[0], packer);
		data.flipped = flipped;
		data.lineHeight = fm[0] + fm[1];
		data.descent = -fm[1];
		data.ascent = fm[0] - fm[2];
		data.down = -data.lineHeight;
		if (flipped) {
			data.ascent = -data.ascent;
			data.down = -data.down;
		}
		data.capHeight = fm[2];
		data.xHeight = fm[3];
		data.spaceXadvance = fm[4];

		//rasterize the replacement character first so the font always has
		//at least one glyph page, then use it for unknown characters
		data.missingGlyph = data.getGlyph('\uFFFD');

		return new BitmapFont(data, data.regions, true);
	}

	@Override
	public String[] splitforTextBlock(String text, boolean multiline) {
		return splitTextBlockJsni(text, multiline);
	}

	/* Asian-script detection, mirroring the desktop regex */

	private static boolean containsAsian(String input) {
		int n = input.length();
		for (int i = 0; i < n; i++) {
			if (isAsianChar(input.charAt(i))) {
				return true;
			}
		}
		return false;
	}

	private static boolean isAsianChar(char c) {
		if (c >= 0x1100 && c <= 0x11FF) return true;   //Hangul Jamo
		if (c >= 0x3000 && c <= 0x303F) return true;   //CJK Symbols and Punctuation
		if (c >= 0x3040 && c <= 0x30FF) return true;   //Hiragana + Katakana
		if (c >= 0x3130 && c <= 0x318F) return true;   //Hangul Compatibility Jamo
		if (c >= 0x3400 && c <= 0x4DBF) return true;   //CJK Extension A
		if (c >= 0x4E00 && c <= 0x9FFF) return true;   //CJK Unified Ideographs
		if (c >= 0xA960 && c <= 0xA97F) return true;   //Hangul Jamo Extended-A
		if (c >= 0xAC00 && c <= 0xD7FF) return true;   //Hangul Syllables + Jamo Extended-B
		if (c >= 0xD800 && c <= 0xDFFF) return true;   //surrogate halves (non-BMP, e.g. CJK ext B+)
		if (c >= 0xF900 && c <= 0xFAFF) return true;   //CJK Compatibility Ideographs
		if (c >= 0xFE30 && c <= 0xFE4F) return true;   //CJK Compatibility Forms
		if (c >= 0xFF00 && c <= 0xFFEF) return true;   //Halfwidth and Fullwidth Forms
		return false;
	}

	/* JSNI */

	private static native boolean supportsVibrationJsni() /*-{
		return !!($wnd.navigator && $wnd.navigator.vibrate);
	}-*/;

	private static native void vibrateJsni( int millis ) /*-{
		if ($wnd.navigator && $wnd.navigator.vibrate) {
			$wnd.navigator.vibrate(millis);
		}
	}-*/;

	private static native void measureFontMetricsJsni(String fontSpec, int size, float[] out) /*-{
		var c = $wnd.__spd_measure_canvas;
		if (!c) {
			c = $wnd.__spd_measure_canvas = $doc.createElement('canvas');
		}
		c.width = 16;
		c.height = 16;
		var ctx = c.getContext('2d');
		ctx.font = fontSpec;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		var m = ctx.measureText('Hg');
		var fba = m.fontBoundingBoxAscent;
		var fbd = m.fontBoundingBoxDescent;
		if (!isFinite(fba) || !isFinite(fbd) || fba <= 0 || fbd < 0) {
			//font bounding box metrics are unavailable, approximate
			fba = size * 1.16;
			fbd = size * 0.3;
		}
		var cap = ctx.measureText('I');
		var capH = (cap.actualBoundingBoxAscent || 0) + (cap.actualBoundingBoxDescent || 0);
		var x = ctx.measureText('x');
		var xH = (x.actualBoundingBoxAscent || 0) + (x.actualBoundingBoxDescent || 0);
		var sp = ctx.measureText(' ');
		out[0] = fba;
		out[1] = fbd;
		out[2] = capH > 0.5 ? capH : size * 0.72;
		out[3] = xH > 0.5 ? xH : size * 0.52;
		out[4] = sp.width > 0 ? sp.width : size * 0.34;
	}-*/;

	private static native void measureGlyphJsni(String fontSpec, String ch, float[] out) /*-{
		var c = $wnd.__spd_measure_canvas;
		if (!c) {
			c = $wnd.__spd_measure_canvas = $doc.createElement('canvas');
		}
		c.width = 16;
		c.height = 16;
		var ctx = c.getContext('2d');
		ctx.font = fontSpec;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		var m = ctx.measureText(ch);
		out[0] = m.actualBoundingBoxLeft || 0;
		out[1] = m.actualBoundingBoxRight || 0;
		out[2] = m.actualBoundingBoxAscent || 0;
		out[3] = m.actualBoundingBoxDescent || 0;
		out[4] = m.width || 0;
	}-*/;

	private static native void drawGlyphJsni(Pixmap pixmap, String fontSpec, String ch, boolean border,
	                                         float borderWidth, float penX, float penY) /*-{
		var ctx = pixmap.@com.badlogic.gdx.graphics.Pixmap::getContext()();
		ctx.font = fontSpec;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.lineJoin = 'round';
		ctx.miterLimit = 2;
		if (border) {
			//centered stroke of width 2*borderWidth expands borderWidth outward,
			//matching freetype's outside stroker
			ctx.lineWidth = 2 * borderWidth;
			ctx.strokeStyle = '#000000';
			ctx.strokeText(ch, penX, penY);
		}
		ctx.fillStyle = '#ffffff';
		//draw twice like the desktop renderCount so borders don't show through
		ctx.fillText(ch, penX, penY);
		ctx.fillText(ch, penX, penY);
	}-*/;

	private static native String[] splitTextBlockJsni(String text, boolean multiline) /*-{
		var literals = ['\n', '_', '\\*\\*'];
		var ranges = ['\u3040-\u309F',   //Hiragana
			'\u30A0-\u30FF',             //Katakana
			'\u4E00-\u9FFF',             //CJK Unified Ideographs
			'\u3000-\u303F'];            //CJK Symbols and Punctuation
		var alts = [];
		if (multiline) {
			alts.push('(?<= )', '(?= )');
		}
		for (var i = 0; i < literals.length; i++) {
			alts.push('(?<=' + literals[i] + ')', '(?=' + literals[i] + ')');
		}
		for (var i = 0; i < ranges.length; i++) {
			alts.push('(?<=[' + ranges[i] + '])', '(?=[' + ranges[i] + '])');
		}
		var re = new RegExp(alts.join('|'), 'g');
		var parts = text.split(re);
		//java's Pattern.split drops trailing empty strings, match that
		while (parts.length > 0 && parts[parts.length - 1] === '') {
			parts.pop();
		}
		return parts;
	}-*/;

	/* Canvas-backed BitmapFontData */

	private static class CanvasFontData extends BitmapFontData {

		final String fontSpec;
		final int size;
		final boolean border;
		final float borderWidth;
		final float ascender;        //canvas fontBoundingBoxAscent, used as the text baseline
		final PixmapPacker packer;
		final Array<TextureRegion> regions = new Array<TextureRegion>();

		private boolean dirty;

		CanvasFontData(String fontSpec, int size, boolean border, float borderWidth, float ascender,
		               PixmapPacker packer) {
			this.fontSpec = fontSpec;
			this.size = size;
			this.border = border;
			this.borderWidth = borderWidth;
			this.ascender = ascender;
			this.packer = packer;
		}

		@Override
		public Glyph getGlyph(char ch) {
			Glyph glyph = super.getGlyph(ch);
			if (glyph == null) {
				glyph = rasterizeGlyph(ch);
				if (glyph == null) {
					return missingGlyph;
				}
				if (regions.size <= glyph.page) {
					packer.updateTextureRegions(regions, TextureFilter.Nearest, TextureFilter.Nearest, false);
				}
				setGlyphRegion(glyph, regions.get(glyph.page));
				setGlyph(ch, glyph);
				dirty = true;
			}
			return glyph;
		}

		@Override
		public void getGlyphs(GlyphRun run, CharSequence str, int start, int end, Glyph lastGlyph) {
			super.getGlyphs(run, str, start, end, lastGlyph);
			if (dirty) {
				dirty = false;
				packer.updateTextureRegions(regions, TextureFilter.Nearest, TextureFilter.Nearest, false);
			}
		}

		private Glyph rasterizeGlyph(char ch) {
			String s = String.valueOf(ch);
			float[] m = new float[5];
			HtmlPlatformSupport.measureGlyphJsni(fontSpec, s, m);
			float abbLeft = m[0];
			float abbRight = m[1];
			float abbAscent = m[2];
			float abbDescent = m[3];
			float advance = m[4];

			//zero-ink glyphs (spaces and other whitespace): nothing to pack
			if (abbLeft + abbRight < 0.5f || abbAscent + abbDescent < 0.5f) {
				Glyph glyph = new Glyph();
				glyph.id = ch;
				glyph.xadvance = Math.max(0, (int) Math.ceil(advance));
				if (ch == ' ') {
					glyph.width = glyph.xadvance;
				}
				return glyph;
			}

			//1px slack around the ink, plus the border expansion
			int pad = (border ? (int) Math.ceil(borderWidth) : 0) + 1;
			int left = (int) Math.floor(-abbLeft) - pad;    //box left edge, relative to the pen
			int top = (int) Math.floor(-abbAscent) - pad;   //box top edge, relative to the baseline
			int w = (int) Math.ceil(abbRight) + pad - left;
			int h = (int) Math.ceil(abbDescent) + pad - top;

			Glyph glyph = new Glyph();
			glyph.id = ch;
			glyph.width = w;
			glyph.height = h;

			Pixmap pixmap = new Pixmap(w, h, Pixmap.Format.RGBA8888);
			HtmlPlatformSupport.drawGlyphJsni(pixmap, fontSpec, s, border, borderWidth, -left, -top);
			PixmapPackerRectangle rect = packer.pack(glyphName(ch), pixmap);
			pixmap.dispose();

			glyph.page = packer.getPages().indexOf(rect.page, true);
			glyph.srcX = (int) rect.getX();
			glyph.srcY = (int) rect.getY();
			glyph.xoffset = left;
			int bitmapTop = -top;
			if (flipped) {
				glyph.yoffset = -bitmapTop + (int) ascender;
			} else {
				glyph.yoffset = -(h - bitmapTop) - (int) ascender;
			}
			glyph.xadvance = Math.max(0, (int) Math.ceil(advance));
			return glyph;
		}

		private String glyphName(char ch) {
			return size + (border ? "b" : "p") + (flipped ? "f" : "n") + "_" + (int) ch;
		}
	}
}
