package java.net;

import java.io.UnsupportedEncodingException;

/**
 * Placeholder URLEncoder for the GWT web port of Shattered Pixel Dungeon.
 * org.json's JSONPointer calls it; the game never uses JSON pointers, so the
 * stub only needs to compile.
 */
public class URLEncoder {

	public static String encode(String s, String enc)
			throws UnsupportedEncodingException {
		return s;
	}
}
