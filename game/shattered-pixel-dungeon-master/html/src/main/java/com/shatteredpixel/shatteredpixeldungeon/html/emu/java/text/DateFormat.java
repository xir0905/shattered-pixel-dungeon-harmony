package java.text;

import java.util.Date;
import java.util.TimeZone;

/** Minimal GWT emulation of java.text.DateFormat for Shattered Pixel Dungeon. */
public abstract class DateFormat {

	public abstract String format(Date date);

	/** No-op by default; java.text.SimpleDateFormat overrides it with a real one. */
	public void setTimeZone(TimeZone timeZone) {
	}
}
