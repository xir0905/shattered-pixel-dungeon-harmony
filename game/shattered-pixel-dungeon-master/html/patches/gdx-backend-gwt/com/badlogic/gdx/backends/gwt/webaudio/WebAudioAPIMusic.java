/*******************************************************************************
 * Copyright 2011 See AUTHORS file.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * HarmonyOS platform patch (SPD html/patches overlay, gdx-backend-gwt 1.14.0):
 *
 * PRIMARY BUG (upstream, all browsers): the 'ended' callback is registered as
 * a bare JSNI method reference (self.@...::ended()). GWT compiles it to a raw
 * prototype method value, so the browser invokes it with `this` bound to the
 * DOM element instead of the WebAudioAPIMusic instance: this.onCompletionListener
 * is therefore always undefined and OnCompletionListener NEVER fires. noosa
 * Music's playTracks path chains tracks through OnCompletionListener
 * (trackLooper), so on-device SPD music (SewerLevel.playLevelMusic ->
 * playTracks(SEWER_TRACK_LIST, ...)) dies permanently at the end of the first
 * track. Fix: wrap the callback in a closure that invokes it on the instance.
 *
 * AUTOPLAY BUG (all Chromium-based WebViews): the very first
 * music.play() happens while the page has not seen a user gesture yet, so the
 * element rejects with NotAllowedError. WebAudioAPIManager resumes the
 * AudioContext on the first input event, but nothing re-issues the rejected
 * play(), so the title theme stays silent until the game happens to start
 * another track (e.g. after entering a level). We remember the play intent on
 * the element and retry once on the first user input; pause()/stop() clear the
 * intent so a deliberately paused track is never resurrected.
 *
 * SECONDARY (defensive, ArkWeb-specific): SPD also uses single-track looping
 * (Music.play(track, true), onCompletionListener == null, e.g. SEWERS_TENSE /
 * THEME_FINALE) which relies on the native 'loop' attribute. If ArkWeb drops
 * the attribute at end-of-stream for non-seekable OGG media (seekable 0-0,
 * duration refined while streaming) instead of wrapping, the element would
 * fall silent with no listener to restart it. This patch remembers the
 * requested looping state in a JS flag (__spdLoop) and adds an 'ended' guard
 * that restarts the element explicitly. play() on an ended element seeks back
 * to the start per the HTML media spec (verified on device). When the element
 * wraps natively the guard never fires, so other browsers are unaffected.
 ******************************************************************************/

package com.badlogic.gdx.backends.gwt.webaudio;

import com.badlogic.gdx.audio.Music;
import com.google.gwt.core.client.JavaScriptObject;
import com.google.gwt.media.client.Audio;

public class WebAudioAPIMusic implements Music {
	// The Audio element to be streamed
	private final Audio audio;

	// Pool from which we will draw, and eventually return to, our AudioControlGraph from
	private final AudioControlGraphPool audioControlGraphPool;

	// The audio graph used to control pan and volume for this piece of music
	private final AudioControlGraph audioControlGraph;

	private OnCompletionListener onCompletionListener;

	public WebAudioAPIMusic (JavaScriptObject audioContext, Audio audio, AudioControlGraphPool audioControlGraphPool) {
		this.audio = audio;
		this.audioControlGraphPool = audioControlGraphPool;

		// Create AudioSourceNode from Audio element
		JavaScriptObject audioSourceNode = createMediaElementAudioSourceNode(audioContext, audio.getAudioElement());

		// Setup the sound graph to control pan and volume
		audioControlGraph = audioControlGraphPool.obtain();
		audioControlGraph.setSource(audioSourceNode);
	}

	public void ended () {
		if (this.onCompletionListener != null) this.onCompletionListener.onCompletion(this);
	}

	public native JavaScriptObject createMediaElementAudioSourceNode (JavaScriptObject audioContext, JavaScriptObject audioElement) /*-{
		var source = audioContext.createMediaElementSource(audioElement);
		var self = this;
		// gdx-backend-gwt 1.14.0 registers the Java ended() callback as a bare
		// method reference; the browser then invokes it with `this` bound to the
		// DOM element, so onCompletionListener is never read from the music
		// instance and noosa Music's trackLooper (playTracks chaining) dies at
		// the end of the first track. Bind the callback to the instance.
		audioElement.addEventListener("ended", function() {
			self.@com.badlogic.gdx.backends.gwt.webaudio.WebAudioAPIMusic::ended()();
		});
		// HarmonyOS ArkWeb quirk (defensive): if a non-seekable OGG element
		// drops its native 'loop' at end-of-stream and fires 'ended' instead of
		// wrapping, restart it explicitly so single-track looping music keeps
		// playing; play() on an ended element seeks back to the start per the
		// HTML media spec.
		audioElement.addEventListener("ended", function() {
			if (audioElement.__spdLoop === true) {
				var p = audioElement.play();
				if (p && p['catch']) p['catch'](function() {});
			}
		});
		return source;
	}-*/;

	@Override
	public void play () {
		playNative(audio.getAudioElement());
	}

	/**
	 * Starts playback and, if the browser blocks it because the page has not
	 * received a user gesture yet (NotAllowedError on the first cold-start
	 * track), retries once on the first user input after the AudioContext has
	 * been unlocked by WebAudioAPIManager. Without this the title theme stays
	 * silent until some later scene change happens to call play() again.
	 */
	private static native void playNative (JavaScriptObject audioElement) /*-{
		var dbg = $wnd.__spdAudio || ($wnd.__spdAudio = { blocked: 0, retries: 0, lastError: null, lastRetryError: null, retryOk: null, stateBefore: null, stateAfter: null });
		dbg.lastMusic = audioElement;
		audioElement.__spdWantPlay = true;
		// Tell the HarmonyOS host that the WebView now has audible music, so
		// it can stop the native title-theme fallback (see Index.ets).
		var signalStarted = function () {
			if (audioElement.__spdSignaled === true) return;
			audioElement.__spdSignaled = true;
			if ($wnd.console && $wnd.console.log) {
				$wnd.console.log('[SPD] music-started');
			}
		};
		var p = audioElement.play();
		if (!p || !p['catch']) return;
		if (p['then']) p['then'](signalStarted);
		p['catch'](function (e) {
			dbg.blocked++;
			dbg.lastError = (e && e.name) || 'reject';
			// Only arm the retry once per element, and only if playback is
			// still wanted (pause()/stop() clear the flag).
			if (audioElement.__spdWantPlay !== true || audioElement.__spdRetryHooked === true) {
				dbg.armSkipped = 'want=' + audioElement.__spdWantPlay + ' hooked=' + audioElement.__spdRetryHooked;
				return;
			}
			// Same event set as WebAudioAPIManager.hookUpSoundUnlockers, so the
			// manager's (earlier registered) listener resumes the AudioContext
			// before our retry runs. Bubble phase, not capture, preserves that
			// registration order.
			var eventNames = [
				'click', 'contextmenu', 'auxclick', 'dblclick', 'mousedown',
				'mouseup', 'pointerup', 'touchend', 'keydown', 'keyup', 'touchstart'
			];
			var onFirst = function () {
				eventNames.forEach(function (name) {
					$doc.removeEventListener(name, onFirst);
				});
				audioElement.__spdRetryHooked = false;
				dbg.retries++;
				dbg.stateBefore = $wnd.__spdAudioContext ? $wnd.__spdAudioContext.state : 'none';
				if (audioElement.__spdWantPlay !== true || !audioElement.paused) {
					dbg.retrySkipped = 'want=' + audioElement.__spdWantPlay + ' paused=' + audioElement.paused;
					return;
				}
				// Resume the shared WebAudio graph inside the same user-gesture
				// task (window.__spdAudioContext is exposed by the patched
				// WebAudioAPIManager). Deferring with setTimeout() loses the
				// transient activation on ArkWeb and play() rejects again.
				if ($wnd.__spdAudioContext && $wnd.__spdAudioContext.state !== 'running') {
					try { $wnd.__spdAudioContext.resume(); } catch (e) {}
				}
				var done = false;
				var doRetry = function () {
					if (done) return;
					done = true;
					dbg.stateAfter = $wnd.__spdAudioContext ? $wnd.__spdAudioContext.state : 'none';
					var retry = audioElement.play();
					if (retry && retry['then']) {
						retry['then'](function () {
							dbg.retryOk = true;
							signalStarted();
						}, function (e2) {
							dbg.retryOk = false;
							dbg.lastRetryError = (e2 && e2.name) || 'reject';
						});
					}
				};
				// ArkWeb quirk: resume() called directly inside the very first
				// gesture handler can leave its promise pending forever (the
				// activation is not applied to the media pipeline yet), while a
				// resume() issued slightly later succeeds. Retry a few times;
				// play() only once the context actually reports 'running'.
				var attemptResume = function (n) {
					if (done) return;
					var ctx = $wnd.__spdAudioContext;
					if (!ctx || ctx.state === 'running') {
						doRetry();
						return;
					}
					dbg.resumeAttempts = n;
					try {
						var rp = ctx.resume();
						if (rp && rp['then']) {
							rp['then'](function () {
								dbg.resumeOk = true;
								doRetry();
							}, function (e3) {
								dbg.resumeError = (e3 && e3.name) || 'reject';
							});
						} else {
							doRetry();
							return;
						}
					} catch (e4) {
						dbg.resumeError = 'throw:' + (e4 && e4.name);
					}
					if (n < 4) {
						$wnd.setTimeout(function () { attemptResume(n + 1); }, 250);
					}
				};
				attemptResume(1);
			};
			audioElement.__spdRetryHooked = true;
			eventNames.forEach(function (name) {
				$doc.addEventListener(name, onFirst);
			});
		});
	}-*/;

	private static native void clearPlayIntent (JavaScriptObject audioElement) /*-{
		audioElement.__spdWantPlay = false;
	}-*/;

	@Override
	public void pause () {
		clearPlayIntent(audio.getAudioElement());
		audio.pause();
	}

	@Override
	public void stop () {
		pause();
		try {
			audio.setCurrentTime(0);
		} catch (Exception ignored) {
			// ArkWeb may not accept seeks on non-seekable streams (seekable
			// 0-0); the element restarts from the beginning on the next play()
			// regardless, so the seek here is best-effort only.
		}
	}

	@Override
	public boolean isPlaying () {
		return !audio.isPaused();
	}

	@Override
	public void setLooping (boolean isLooping) {
		audio.setLoop(isLooping);
		setSpdLoopFlag(audio.getAudioElement(), isLooping);
	}

	private static native void setSpdLoopFlag (JavaScriptObject audioElement, boolean isLooping) /*-{
		// Remember the looping intent: ArkWeb may clear the native 'loop'
		// attribute when the stream ends (see the ended guard above).
		audioElement.__spdLoop = isLooping;
	}-*/;

	@Override
	public boolean isLooping () {
		return audio.isLoop() || isSpdLoopFlag(audio.getAudioElement());
	}

	private static native boolean isSpdLoopFlag (JavaScriptObject audioElement) /*-{
		return audioElement.__spdLoop === true;
	}-*/;

	@Override
	public void setVolume (float volume) {
		// Volume can be controlled on the Audio element, or as part of the audio graph. We do it as part of the graph to ensure we
		// use as much common code as possible with the sound effect code.
		audioControlGraph.setVolume(volume);
	}

	@Override
	public float getVolume () {
		return audioControlGraph.getVolume();
	}

	@Override
	public void setPan (float pan, float volume) {
		audioControlGraph.setPan(pan);
		audioControlGraph.setVolume(volume);
	}

	@Override
	public void setPosition (float position) {
		audio.setCurrentTime(position);
	}

	@Override
	public float getPosition () {
		return (float)audio.getCurrentTime();
	}

	@Override
	public void dispose () {
		// Stop the music
		pause();

		// Tear down the audio graph
		audioControlGraphPool.free(audioControlGraph);
	}

	@Override
	public void setOnCompletionListener (OnCompletionListener listener) {
		this.onCompletionListener = listener;
	}
}
