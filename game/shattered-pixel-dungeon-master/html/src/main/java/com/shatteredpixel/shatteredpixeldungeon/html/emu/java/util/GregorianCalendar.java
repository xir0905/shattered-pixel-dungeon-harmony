package java.util;

/**
 * Minimal GWT emulation of java.util.GregorianCalendar for Shattered Pixel
 * Dungeon. Backed by the GWT java.util.Date emulation (JavaScript Date), so
 * all fields are in the browser's local timezone, matching desktop behaviour.
 */
public class GregorianCalendar extends Calendar {

	private static final int[] CUMULATIVE_DAYS = {0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334};

	private Date date;

	public GregorianCalendar() {
		date = new Date();
	}

	@Override
	public void setTime(Date date) {
		this.date = date;
	}

	@Override
	public int get(int field) {
		switch (field) {
			case YEAR:
				return date.getYear() + 1900;
			case MONTH:
				return date.getMonth();
			case DAY_OF_MONTH:
				return date.getDate();
			case DAY_OF_YEAR: {
				int year = date.getYear() + 1900;
				int month = date.getMonth();
				int day = date.getDate();
				int doy = CUMULATIVE_DAYS[month] + day;
				if (month >= FEBRUARY && isLeapYear(year)) doy++;
				return doy;
			}
			case HOUR_OF_DAY:
				return date.getHours();
			case MINUTE:
				return date.getMinutes();
			case SECOND:
				return date.getSeconds();
			case MILLISECOND:
				// GWT's Date emulation does not expose getMilliseconds; the
				// game never reads this field.
				return 0;
			case DAY_OF_WEEK:
				// 1 = Sunday ... 7 = Saturday; JS Date.getDay(): 0 = Sunday
				return date.getDay() + 1;
			default:
				return 0;
		}
	}

	@Override
	public int getActualMaximum(int field) {
		if (field == DAY_OF_YEAR) {
			return isLeapYear(date.getYear() + 1900) ? 366 : 365;
		}
		if (field == DAY_OF_MONTH) {
			int month = date.getMonth();
			if (month == FEBRUARY && isLeapYear(date.getYear() + 1900)) return 29;
			return CUMULATIVE_DAYS[month + 1] - CUMULATIVE_DAYS[month];
		}
		return 0;
	}

	private static boolean isLeapYear(int year) {
		return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
	}
}
