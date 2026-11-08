package java.text;

import java.util.Locale;

/**
 * Minimal GWT emulation of java.text.NumberFormat for Shattered Pixel
 * Dungeon. Supports format(long) and format(double) with ',' grouping, which
 * is all the game uses (score/rank windows).
 */
public class NumberFormat {

	public static NumberFormat getInstance(Locale locale) {
		return new NumberFormat();
	}

	public static NumberFormat getNumberInstance(Locale locale) {
		return getInstance(locale);
	}

	public String format(long number) {
		return group(number);
	}

	public String format(double number) {
		if (number == Math.rint(number) && !Double.isInfinite(number)
				&& Math.abs(number) < 9.007199254740992E15) {
			return group((long) number);
		}
		return String.valueOf(number);
	}

	static String group(long number) {
		String digits = String.valueOf(Math.abs(number));
		StringBuilder sb = new StringBuilder();
		if (number < 0) sb.append('-');
		int len = digits.length();
		for (int i = 0; i < len; i++) {
			sb.append(digits.charAt(i));
			int remaining = len - i - 1;
			if (remaining > 0 && remaining % 3 == 0) sb.append(',');
		}
		return sb.toString();
	}
}
