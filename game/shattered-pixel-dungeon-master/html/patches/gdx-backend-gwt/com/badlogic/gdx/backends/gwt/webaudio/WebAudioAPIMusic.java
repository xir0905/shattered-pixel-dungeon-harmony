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
		audio.play();
	}

	@Override
	public void pause () {
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
