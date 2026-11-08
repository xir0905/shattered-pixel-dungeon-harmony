package java.util;

/**
 * Minimal java.util.UUID emulation for the GWT web port. GWT 2.11 ships no
 * UUID emul; the game only uses UUID.randomUUID().toString() to mint run
 * identifiers (Rankings.gameID), so an RFC 4122 v4-format random string
 * suffices. A single static Random keeps successive calls unique.
 */
public final class UUID {

	private static final char[] HEX = "0123456789abcdef".toCharArray();

	private static final Random RANDOM = new Random();

	private final String value;

	private UUID(String value) {
		this.value = value;
	}

	public static UUID randomUUID() {
		char[] chars = new char[36];
		for (int i = 0; i < 36; i++) {
			if (i == 8 || i == 13 || i == 18 || i == 23) {
				chars[i] = '-';
			} else {
				chars[i] = HEX[RANDOM.nextInt(16)];
			}
		}
		// RFC 4122 version 4 and variant bits
		chars[14] = '4';
		chars[19] = HEX[8 + RANDOM.nextInt(4)];
		return new UUID(new String(chars));
	}

	@Override
	public String toString() {
		return value;
	}
}
