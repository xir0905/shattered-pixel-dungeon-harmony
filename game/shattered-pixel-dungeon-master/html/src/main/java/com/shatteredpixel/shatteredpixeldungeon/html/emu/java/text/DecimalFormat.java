package java.text;

import java.util.Locale;

/**
 * Minimal GWT emulation of java.text.DecimalFormat for Shattered Pixel
 * Dungeon. Supports the patterns used by the game:
 *   "#.##"  - up to two decimals, trailing zeros stripped
 *   "#"     - integer, rounded
 *   "#.##x" - numeric part plus a literal suffix
 * Round-half-up is applied, matching the desktop behaviour closely enough
 * for the percentage/stat strings the game formats.
 */
public class DecimalFormat extends NumberFormat {

	private final String pattern;
	private final int decimals;
	private final String suffix;

	public DecimalFormat(String pattern, DecimalFormatSymbols symbols) {
		this(pattern);
	}

	public DecimalFormat(String pattern) {
		this.pattern = pattern;
		int i = 0;
		while (i < pattern.length()) {
			char c = pattern.charAt(i);
			if (c == '0' || c == '#' || c == '.' || c == ',') {
				i++;
			} else {
				break;
			}
		}
		String numeric = pattern.substring(0, i);
		this.suffix = pattern.substring(i);
		int dot = numeric.indexOf('.');
		this.decimals = dot < 0 ? 0 : numeric.length() - dot - 1;
	}

	public DecimalFormat() {
		this("#.##");
	}

	@Override
	public String format(long number) {
		return format((double) number);
	}

	@Override
	public String format(double number) {
		long factor = 1;
		for (int i = 0; i < decimals; i++) factor *= 10;
		long rounded = Math.round(number * factor);
		boolean negative = rounded < 0;
		if (negative) rounded = -rounded;
		String intPart = String.valueOf(rounded / factor);
		String fracPart = "";
		if (decimals > 0) {
			fracPart = String.valueOf(rounded % factor);
			while (fracPart.length() < decimals) fracPart = "0" + fracPart;
			while (fracPart.endsWith("0")) fracPart = fracPart.substring(0, fracPart.length() - 1);
		}
		StringBuilder sb = new StringBuilder();
		if (negative) sb.append('-');
		sb.append(intPart);
		if (fracPart.length() > 0) {
			sb.append('.');
			sb.append(fracPart);
		}
		sb.append(suffix);
		return sb.toString();
	}

	public String toPattern() {
		return pattern;
	}
}
