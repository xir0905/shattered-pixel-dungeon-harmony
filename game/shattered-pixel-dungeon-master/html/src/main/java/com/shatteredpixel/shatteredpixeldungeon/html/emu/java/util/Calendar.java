package java.util;

/**
 * Minimal GWT emulation of java.util.Calendar for Shattered Pixel Dungeon.
 * Provides the field constants used by the game and delegates to
 * GregorianCalendar for the implementation.
 */
public abstract class Calendar {

	public static final int ERA = 0;
	public static final int YEAR = 1;
	public static final int MONTH = 2;
	public static final int WEEK_OF_YEAR = 3;
	public static final int WEEK_OF_MONTH = 4;
	public static final int DAY_OF_MONTH = 5;
	public static final int DAY_OF_YEAR = 6;
	public static final int DAY_OF_WEEK = 7;
	public static final int DAY_OF_WEEK_IN_MONTH = 8;
	public static final int AM_PM = 9;
	public static final int HOUR = 10;
	public static final int HOUR_OF_DAY = 11;
	public static final int MINUTE = 12;
	public static final int SECOND = 13;
	public static final int MILLISECOND = 14;

	public static final int JANUARY = 0;
	public static final int FEBRUARY = 1;
	public static final int MARCH = 2;
	public static final int APRIL = 3;
	public static final int MAY = 4;
	public static final int JUNE = 5;
	public static final int JULY = 6;
	public static final int AUGUST = 7;
	public static final int SEPTEMBER = 8;
	public static final int OCTOBER = 9;
	public static final int NOVEMBER = 10;
	public static final int DECEMBER = 11;

	public static Calendar getInstance() {
		return new GregorianCalendar();
	}

	public abstract int get(int field);

	public abstract int getActualMaximum(int field);

	public abstract void setTime(Date date);
}
