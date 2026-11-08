package java.net;

import java.io.UnsupportedEncodingException;

/**
 * Placeholder URLDecoder for the GWT web port of Shattered Pixel Dungeon.
 * org.json's JSONPointer calls it; the game never uses JSON pointers, so the
 * stub only needs to compile.
 */
public class URLDecoder {

	public static String decode(String s, String enc)
			throws UnsupportedEncodingException {
		return s;
	}
}
