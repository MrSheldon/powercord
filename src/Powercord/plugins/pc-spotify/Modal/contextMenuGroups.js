const { clipboard, shell } = require('electron');
const { messages, channels } = require('powercord/webpack');
const { formatTime } = require('powercord/util');
const SpotifyPlayer = require('../SpotifyPlayer');

module.exports = (state, onButtonClick, hasCustomAuth, hasControlsHidden) => [
  [ {
    type: 'submenu',
    name: 'Devices',
    width: '200px',
    getItems: () => SpotifyPlayer.getDevices()
      .then(({ devices }) =>
        devices.map(device => {
          const isActiveDevice = device.id === state.deviceID;

          return {
            type: 'button',
            name: device.name,
            hint: device.type,
            highlight: isActiveDevice && '#1ed860',
            disabled: isActiveDevice,
            seperate: isActiveDevice,
            onClick: () => onButtonClick('setActiveDevice', device.id)
          };
        }).sort(button => !button.highlight)
      )
  } ],

  [ {
    type: 'submenu',
    name: 'Playlists',
    width: '200px',
    getItems: () => SpotifyPlayer.getPlaylists()
      .then(({ items }) =>
        items.map(playlist => ({
          type: 'button',
          name: playlist.name,
          hint: `${playlist.tracks.total} tracks`,
          onClick: () => onButtonClick('play', {
            context_uri: playlist.uri
          })
        }))
      )
  }, ...(hasCustomAuth
    ? [ {
      type: 'submenu',
      name: 'Albums',
      width: '200px',
      getItems: () => SpotifyPlayer.getAlbums()
        .then(({ items }) =>
          items.map(({ album }) => ({
            type: 'button',
            name: album.name,
            hint: `${album.tracks.total} tracks`,
            onClick: () => onButtonClick('play', {
              context_uri: album.uri
            })
          }))
        )
    } ]
    : []), ...(hasCustomAuth
    ? [ {
      type: 'submenu',
      name: 'Songs',
      width: '200px',
      getItems: () => SpotifyPlayer.getSongs()
        .then(({ items }) =>
          items.map(({ track }) => ({
            type: 'button',
            name: track.name,
            hint: formatTime(track.duration_ms),
            onClick: () => onButtonClick('play', {
              uris: [ track.uri ]
            })
          }))
        )
    } ]
    : []) ],

  ...(hasCustomAuth && hasControlsHidden
    ? [ [ {
      type: 'submenu',
      name: 'Playback Settings',
      getItems: () => [ {
        type: 'submenu',
        name: 'Repeat Modes',
        getItems: () => [ {
          name: 'On',
          stateName: 'context'
        }, {
          name: 'Current Track',
          stateName: 'track'
        }, {
          name: 'Off',
          stateName: 'off'
        } ].map(button => ({
          type: 'button',
          highlight: state.repeatState === button.stateName && '#1ed860',
          disabled: state.repeatState === button.stateName,
          onClick: () => onButtonClick('setRepeatState', button.stateName),
          ...button
        }))
      }, {
        type: 'checkbox',
        name: 'Shuffle',
        defaultState: state.shuffleState,
        onToggle: (s) => onButtonClick('setShuffleState', s)
      } ]
    } ] ]
    : []),

  [ {
    type: 'slider',
    name: 'Volume',
    color: '#1ed860',
    defaultValue: state.volume,
    onValueChange: (val) =>
      SpotifyPlayer.setVolume(Math.round(val))
        .then(() => true)
  }, ...(hasCustomAuth && hasControlsHidden
    ? [ {
      type: 'button',
      name: 'Add to Library',
      onClick: () =>
        SpotifyPlayer.addSong(state.currentItem.id)
    }, {
      type: 'button',
      name: 'Save to Playlist',
      onClick: () =>
        powercord.pluginManager.get('pc-spotify').openPlaylistModal(state.currentItem.id)
      } ]
    : []) ],

  [ {
    type: 'button',
    name: 'Open in Spotify',
    onClick: () =>
      shell.openExternal(state.currentItem.uri)
  }, {
    type: 'button',
    name: 'Send URL to Channel',
    onClick: () =>
      messages.sendMessage(
        channels.getChannelId(),
        { content: state.currentItem.url }
      )
  }, {
    type: 'button',
    name: 'Copy URL',
    onClick: () =>
      clipboard.writeText(state.currentItem.url)
  } ]
];
