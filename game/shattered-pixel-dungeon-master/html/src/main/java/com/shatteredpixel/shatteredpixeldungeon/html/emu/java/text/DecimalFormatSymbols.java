package java.text;

import java.util.Locale;

/**
 * Minimal GWT emulation of java.text.DecimalFormatSymbols for Shattered Pixel
 * Dungeon. The game only ever uses getInstance(locale) as a placeholder
 * argument for the DecimalFormat constructor, so the symbols are fixed to
 * ROOT conventions ('.' decimal separator, ',' grouping separator).
 */
public class DecimalFormatSymbols {

	private static final DecimalFormatSymbols INSTANCE = new DecimalFormatSymbols();

	public static DecimalFormatSymbols getInstance(Locale locale) {
		return INSTANCE;
	}

	public char getDecimalSeparator() {
		return '.';
	}

	public char getGroupingSeparator() {
		return ',';
	}
}
