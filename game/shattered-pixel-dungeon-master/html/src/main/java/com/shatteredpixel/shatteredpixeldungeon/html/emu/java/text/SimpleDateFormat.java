package java.text;

import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Minimal GWT emulation of java.text.SimpleDateFormat for Shattered Pixel
 * Dungeon. Supports the pattern letters the game uses: yyyy, MM, dd, HH, mm,
 * ss (also single-letter forms). Anything else is emitted literally.
 */
public class SimpleDateFormat extends DateFormat {

	private final String pattern;
	private TimeZone timeZone;

	public SimpleDateFormat(String pattern, Locale locale) {
		this.pattern = pattern;
	}

	public SimpleDateFormat(String pattern) {
		this(pattern, Locale.getDefault());
	}

	public void setTimeZone(TimeZone timeZone) {
		this.timeZone = timeZone;
	}

	public TimeZone getTimeZone() {
		return timeZone;
	}

	@Override
	public String format(Date date) {
		int year, month, day, hour, minute, second;
		if (timeZone != null && timeZone.isUTC()) {
			long t = date.getTime();
			long days = floorDiv(t, 86400000L);
			long secsOfDay = floorDiv(t, 1000L) - days * 86400L;
			int[] ymd = civilFromDays(days);
			year = ymd[0];
			month = ymd[1];
			day = ymd[2];
			hour = (int) (secsOfDay / 3600);
			minute = (int) ((secsOfDay % 3600) / 60);
			second = (int) (secsOfDay % 60);
		} else {
			year = date.getYear() + 1900;
			month = date.getMonth() + 1;
			day = date.getDate();
			hour = date.getHours();
			minute = date.getMinutes();
			second = date.getSeconds();
		}

		StringBuilder sb = new StringBuilder();
		int i = 0;
		while (i < pattern.length()) {
			char c = pattern.charAt(i);
			if (c == 'y' || c == 'M' || c == 'd' || c == 'H' || c == 'm' || c == 's') {
				int run = 1;
				while (i + run < pattern.length() && pattern.charAt(i + run) == c) run++;
				sb.append(field(c, run, year, month, day, hour, minute, second));
				i += run;
			} else {
				sb.append(c);
				i++;
			}
		}
		return sb.toString();
	}

	private static String field(char c, int run, int year, int month, int day, int hour, int minute, int second) {
		int value;
		switch (c) {
			case 'y': value = year; break;
			case 'M': value = month; break;
			case 'd': value = day; break;
			case 'H': value = hour; break;
			case 'm': value = minute; break;
			case 's': value = second; break;
			default: return String.valueOf(c);
		}
		String s = String.valueOf(value);
		if (run >= 2 && s.length() < 2) s = "0" + s;
		if (c == 'y' && run == 2) s = s.length() > 2 ? s.substring(s.length() - 2) : s;
		return s;
	}

	private static long floorDiv(long x, long y) {
		long r = x / y;
		if ((x % y != 0) && ((x < 0) != (y < 0))) r--;
		return r;
	}

	/** Howard Hinnant's civil-from-days algorithm. days since 1970-01-01. */
	private static int[] civilFromDays(long z) {
		z += 719468;
		long era = (z >= 0 ? z : z - 146096) / 146097;
		long doe = z - era * 146097;
		long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
		long y = yoe + era * 400;
		long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
		long mp = (5 * doy + 2) / 153;
		long d = doy - (153 * mp + 2) / 5 + 1;
		long m = mp < 10 ? mp + 3 : mp - 9;
		if (m <= 2) y++;
		return new int[]{(int) y, (int) m, (int) d};
	}
}
