package java.util;

/** Minimal GWT emulation of java.util.TimeZone for Shattered Pixel Dungeon. */
public class TimeZone {

	public static final TimeZone UTC = new TimeZone(true);

	private final boolean utc;

	private TimeZone(boolean utc) {
		this.utc = utc;
	}

	public static TimeZone getTimeZone(String id) {
		if (id != null && (id.equals("UTC") || id.equals("GMT") || id.equals("UTC+0"))) {
			return UTC;
		}
		// Any other id falls back to the local zone.
		return new TimeZone(false);
	}

	public static TimeZone getDefault() {
		return new TimeZone(false);
	}

	//public: accessed cross-package from java.text.SimpleDateFormat
	public boolean isUTC() {
		return utc;
	}
}
