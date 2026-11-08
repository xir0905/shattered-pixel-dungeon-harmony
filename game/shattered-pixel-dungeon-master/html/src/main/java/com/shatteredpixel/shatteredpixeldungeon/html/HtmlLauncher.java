package com.shatteredpixel.shatteredpixeldungeon.html;

import com.badlogic.gdx.Files;
import com.badlogic.gdx.backends.gwt.GwtApplication;
import com.badlogic.gdx.backends.gwt.GwtApplicationConfiguration;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.watabou.noosa.Game;
import com.watabou.utils.FileUtils;

/**
 * Entry point for the GWT (web) build of Shattered Pixel Dungeon.
 *
 * onModuleLoad is overridden to first wait (with a timeout) for the web fonts
 * used by the canvas font generator to load, then start the application as
 * usual. Without this, glyphs rasterized during the first frames would be
 * measured with a fallback font.
 */
public class HtmlLauncher extends GwtApplication {

	@Override
	public GwtApplicationConfiguration getConfig() {
		//resizable + usePhysicalPixels: the canvas backing store is created at the
		//device's physical resolution (CSS size * devicePixelRatio) instead of CSS
		//pixels. On the HarmonyOS WebView (dpr 3.25) this removes the compositor's
		//3.25x linear upscale that blurred the pixel font and tile art. The game's
		//default zoom compensates via the getDensity() override patched into
		//GwtGraphics (returns devicePixelRatio), so on-screen element sizes stay
		//within ~10% of the CSS-pixel build while rendering 1:1 sharp.
		GwtApplicationConfiguration cfg = new GwtApplicationConfiguration(true);
		cfg.padVertical = 0;
		cfg.padHorizontal = 0;
		//needed so headless/screenshot capture (and later ArkWeb) reliably
		//picks up WebGL canvas content for UI verification
		cfg.preserveDrawingBuffer = true;
		return cfg;
	}

	@Override
	public com.badlogic.gdx.ApplicationListener createApplicationListener() {
		Game.version = "4.0.2";
		Game.versionCode = 922;
		//on the web, save/ranking/journal files live in localStorage
		//(see the LocalStorageFileHandle patch in the gdx GWT backend)
		FileUtils.setDefaultFileProperties(Files.FileType.Local, "");
		return new ReadySignalingListener(new ShatteredPixelDungeon(new HtmlPlatformSupport()));
	}

	/**
	 * Delegating wrapper that tells the HarmonyOS host (via a console message)
	 * when the game has finished rendering its first stable frames, so the
	 * native loading overlay in entry/src/main/ets/pages/Index.ets can hide.
	 *
	 * noosa Game.render() creates the initial scene during the *first* call
	 * (Game.step() instantiates TitleScene) and draws it from the second call
	 * on, so we signal at the start of render #3: by then the title scene has
	 * been presented at least once and the canvas is no longer black.
	 */
	private static final class ReadySignalingListener implements com.badlogic.gdx.ApplicationListener {
		private final com.badlogic.gdx.ApplicationListener delegate;
		private int renderCount = 0;

		ReadySignalingListener(com.badlogic.gdx.ApplicationListener delegate) {
			this.delegate = delegate;
		}

		@Override
		public void create() {
			delegate.create();
		}

		@Override
		public void resize(int width, int height) {
			delegate.resize(width, height);
		}

		@Override
		public void render() {
			if (++renderCount == 3) {
				signalReady();
			}
			delegate.render();
		}

		@Override
		public void pause() {
			delegate.pause();
		}

		@Override
		public void resume() {
			delegate.resume();
		}

		@Override
		public void dispose() {
			delegate.dispose();
		}
	}

	private static native void signalReady() /*-{
		if ($wnd.console && $wnd.console.log) {
			$wnd.console.log("[SPD] game-ready");
		}
	}-*/;

	@Override
	public void onModuleLoad() {
		waitForFonts(new Runnable() {
			@Override
			public void run() {
				HtmlLauncher.super.onModuleLoad();
			}
		});
	}

	private static native void waitForFonts(Runnable then) /*-{
		var done = false;
		var finish = function () {
			if (done) return;
			done = true;
			then.@java.lang.Runnable::run()();
		};
		var timeout = $wnd.setTimeout(finish, 4000);
		var tryLoad = function () {
			if (!($doc.fonts && $doc.fonts.load)) {
				finish();
				return;
			}
			var remaining = 2;
			var check = function () {
				remaining--;
				if (remaining <= 0) {
					$wnd.clearTimeout(timeout);
					finish();
				}
			};
			$doc.fonts.load('16px pixel_font').then(check, check);
			$doc.fonts.load('16px droid_sans').then(check, check);
		};
		if ($doc.readyState === 'complete' || $doc.readyState === 'interactive') {
			tryLoad();
		} else {
			$doc.addEventListener('DOMContentLoaded', function () {
				tryLoad();
			});
		}
	}-*/;
}
