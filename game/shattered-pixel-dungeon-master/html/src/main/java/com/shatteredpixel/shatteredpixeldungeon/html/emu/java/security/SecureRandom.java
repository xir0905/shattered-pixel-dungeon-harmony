package java.security;

import java.util.Random;

/**
 * GWT emulation of java.security.SecureRandom for Shattered Pixel Dungeon.
 * The browser sandbox exposes no separate secure entropy source through the
 * emulated JRE, so the platform PRNG is used instead. The game only relies on
 * it for missile weapon stack ids (MissileWeapon.setID).
 */
public class SecureRandom extends Random {

	public SecureRandom() {
		super();
	}

	public SecureRandom(long seed) {
		super(seed);
	}
}
