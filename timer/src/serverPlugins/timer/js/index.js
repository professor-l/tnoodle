// For some reason, alert, prompt, and confirm don't fire the 
// blur and focus events on the window. This hack ensures that they
// do.
function wrapFunctionInBlur(func) {
	return function() {
		window.fireEvent('blur');
		func.apply(null, arguments);
		window.fireEvent('focus');
	};
};
alert = wrapFunctionInBlur(alert);
prompt = wrapFunctionInBlur(prompt);
confirm = wrapFunctionInBlur(confirm);

window.addEvent('domready', function() {
	var server = new tnoodle.server(location.hostname, location.port);
	var configuration = server.configuration;
	
	function onPuzzlesLoaded(puzzles) {
		var puzzle = configuration.get('scramble.puzzle', '3x3x3');
		scrambleStuff.setSelectedPuzzle(puzzle);
	}
	var scrambleStuff = new ScrambleStuff(server, onPuzzlesLoaded);
	document.getElementById('puzzleChooser').appendChild(scrambleStuff.puzzleSelect);
	document.getElementById('scrambleArea').appendChild(scrambleStuff.scrambleArea);

	var timer = new KeyboardTimer($('timer'), server, scrambleStuff);
	var session = null;
	
	var updatingSession = false;
	scrambleStuff.addPuzzleChangeListener(function(newPuzzle, updateSession) {
		updatingSession = true;
		if(updateSession) {
			session.setPuzzle(newPuzzle);
		} else {
			session = null;
		}
		configuration.set('scramble.puzzle', newPuzzle);
		eventSelect.refresh();
		updatingSession = false;
	});

	function getEvents() {
		return server.getEvents(scrambleStuff.getSelectedPuzzle());
	}
	var eventSelect = tnoodle.tnt.createSelect('Click to open last session with event', 'Click to change current session event');
	eventSelect.refresh = function() {
		var events = getEvents();
		var options = [];
		for(var i = 0; i < events.length; i++) {
			var txt = events[i];
			options.push({ value: events[i], text: txt });
		}
		options.push({ value: null, text: 'Edit' });
		eventSelect.setOptions(options);

		var event;
		if(session === null) {
			event = configuration.get('scramble.puzzle.event', '');
			if(events.indexOf(event) < 0) {
				event = events[0];
			}
		} else {
			event = session.getEvent();
		}
		eventSelect.setSelected(event);
	};
	eventSelect.linebreak = new Element('br');
	$('puzzleChooser').adopt(eventSelect.linebreak);
	$('puzzleChooser').adopt(eventSelect);

	eventSelect.onchange = function(updateSession) {
		var event = eventSelect.getSelected();
		if(event === null) {
			// We don't want to leave the "Edit" option selected
			eventSelect.setSelected(session.getEvent() || '');
			/*
			var editEventsPopup = tnoodle.tnt.createPopup(null, eventSelect.refresh);
			var onAdd = function(newItem) {
				server.createEvent(session.getPuzzle(), newItem);
			};
			var onRename = function(oldItem, newItem) {
				server.renameEvent(session.getPuzzle(), oldItem, newItem);
			};
			var onDelete = function(oldItem) {
				server.deleteEvent(session.getPuzzle(), oldItem);
			};
			editEventsPopup.appendChild(tnoodle.tnt.createEditableList(getEvents(), onAdd, onRename, onDelete));
			editEventsPopup.show();
			*/
			var newEvent = prompt("Enter name of new event (this will become a pretty gui someday, I promise!)");
			if(newEvent) {
				server.createEvent(session.getPuzzle(), newEvent);
				eventSelect.refresh();
			}
			return;
		}
		if(!updateSession && !updatingSession) {
			session = null;
		} else if(session !== null) {
			session.setEvent(event);
		}
		configuration.set('scramble.puzzle.event', event);
		sessionSelect.refresh();
	}; //for some reason, the change event doesn't fire until the select loses focus

	//TODO - actually delete this
	var sessionSelect = tnoodle.tnt.createSelect('Click to open session');
	sessionSelect.linebreak = new Element('br');
	sessionSelect.linebreak.setStyle('font-size', 22); // omg, this is disgusting
	$('puzzleChooser').adopt(sessionSelect.linebreak);
	$('puzzleChooser').adopt(sessionSelect);
	sessionSelect.refresh = function() {
		var puzzle = scrambleStuff.getSelectedPuzzle();
		var event = eventSelect.getSelected();

		var options = [];
		options.push({ value: null, text: 'New session' });

		var sessions = server.getSessions(puzzle, event);
		sessions.reverse(); // We want to list our sessions starting with the most recent
		if(sessions.length === 0) {
			sessions.push(server.createSession(puzzle, event));
		}
		for(var i = 0; i < sessions.length; i++) {
			var date = sessions[i].getDate().format('%b %d, %Y %H:%M');
			options.push({ value: sessions[i], text: date });
		}
		sessionSelect.setOptions(options);
		if(session === null || sessions.indexOf(session) < 0) {
			// If the current session was just deleted,
			// select the newest one
			session = sessions[0];
		}
		sessionSelect.setSelected(session);
	};
	sessionSelect.onchange = function(e) {
		session = sessionSelect.getSelected();
		if(session === null) {
			// New session will create & select a new session
			newSession();
			return;
		}
		timesTable.setSession(session);
		$('sessionComment').refresh();
	};
	$('sessionComment').refresh = function() {
		var comment = session.getComment();
		if(comment === null) {
			$('sessionComment').value = 'Enter comment here';
			$('sessionComment').setStyle('color', 'gray');
		} else {
			$('sessionComment').value = comment;
			$('sessionComment').setStyle('color', 'black');
		}
	};
	$('sessionComment').addEvent('focus', function() {
		if(this.getStyle('color') == 'gray') {
			this.value = '';
			this.setStyle('color', 'black');
		}
		setTimeout(this.select.bind(this), 0);
	});
	$('sessionComment').addEvent('keydown', function(e) {
		if(e.key == "enter" || e.key == "esc") {
			this.blur();
		}
	});
	$('sessionComment').addEvent('blur', function() {
		session.setComment($('sessionComment').value);
		$('sessionComment').refresh();
	});

	//we try to be clever and change the href only after the anchor has been clicked
	//this should save us the bother of generating the csv over and over again
	//TODO - this is probably getting called twice when clicking, due to the mousedown event, and then the click event
	function downloadCSV() {
		var keys = server.timeKeys;
		var data = server.timeKeyNames.join(',')+"\n";
		
		var times = session.times;
		for(var i = 0; i < session.times.length; i++) {
			var time = session.times[i];
			for(var j = 0; j < keys.length; j++) {
				var key = keys[j];
				var val = time.format(key);
				//we surround each value with double quotes and escape each double quote, just to be safe
				val = val === null ?
						'' :
						'"' + val.replace(/"/g, '""') + '"';
				data += val + ',';
			}
			data += "\n";
		}
		var uri = 'data:text/csv;charset=utf8,' + encodeURIComponent(data);
		this.href = uri;
	}
	function resetSession() {
		timesTable.reset();
	}
	function deleteSession() {
		if(confirm("Are you sure you want to delete the session?")) {
			server.disposeSession(session);
			sessionSelect.refresh(); // This will cause the latest session to be selected
		}
	}
	function newSession() {
		var puzzle = scrambleStuff.getSelectedPuzzle();
		var event = eventSelect.getSelected();
		// We create a new session, and then refresh our list
		// Refreshing will cause session to be selected
		session = server.createSession(puzzle, event);
		sessionSelect.refresh();
	}
	
	var timesTable = new TimesTable($('timesTable'), server, scrambleStuff);
	timer.addEvent('newTime', function(time) {
		//TODO - this may need to wait for the sessions to load...
		timesTable.addTime(time);
	});
	timesTable.addEvent('tableChanged', function() {
		//timer.setStringy(timesTable.lastAddedRow.time.format());
		timer.redraw();
	});
	
	$('newSession').addEvent('click', newSession);
	$('resetSession').addEvent('click', resetSession);
	$('deleteSession').addEvent('click', deleteSession);
	$('downloadCSV').addEvent('click', downloadCSV);
	$('downloadCSV').addEvent('mousedown', downloadCSV);

	$('timer').resize = function() {
		timer.redraw();
	};
	$('scrambles').resize = scrambleStuff.resize;
	function getMaxWidth(el) {
		// Returns the maximum size the element can take up without falling
		// off the right side of the screen.
		return document.body.getSize().x - el.getPosition().x - 20;
	}
	$('times').resize = function() {
		var available = $('times').getSize();
		var remainingHeight = available.y - $('timesArea').getStyle('border-top').toInt() - $('timesArea').getStyle('border-bottom').toInt();
		$('timesArea').setStyle('height', remainingHeight);
		var seshCommentWidth = available.x - 30;
		$('sessionComment').setStyle('width', Math.max(50, seshCommentWidth));

		var selects = [ scrambleStuff.puzzleSelect, eventSelect, sessionSelect ];
		selects.each(function(select) {
			if(select.linebreak) {
				select.linebreak.setStyle('display', 'none');
			}
			select.setMaxWidth(null);
		});
		selects.each(function(select) {
			var maxWidth = getMaxWidth(select);
			if(select.linebreak && select.getSize().x > maxWidth) {
				select.linebreak.setStyle('display', '');
				// Adding a newline gives us more space
				maxWidth = getMaxWidth(select);
			}
			select.setMaxWidth(maxWidth);
		});
		
		timesTable.resize();
	};
	$('times').getPreferredWidth = function() {
		return timesTable.getPreferredWidth();
	};

	
	var triLayout = new TriLayout($('timer'), $('scrambles'), $('times'), configuration);
	timesTable.manager = triLayout;
	
	//TODO - yeah...
	aboutText = '<h2 style="margin: 0;">TNoodle Timer (TNT) v' + tnoodle.tnt.version + '</h2><br/>' +
				'Created by Jeremy Fleischman from the ashes of CCT.<br/>' +
				'Thanks to Leyan Lo for ideas/couch';
	var aboutPopup = tnoodle.tnt.createPopup();
	aboutPopup.innerHTML = aboutText;
	$('aboutLink').addEvent('click', function() {
		aboutPopup.show();
	});
	
	$('helpLink').doClick = function() {
		helpPopup.refresh();
		helpPopup.show();
	};
	$('helpLink').addEvent('click', $('helpLink').doClick);
	
	// This subclass of Keyboard ensures that
	// shortcuts only work when we're not timing,
	// editing a text box, or doing something else
	// we care about.
	var editingShortcutField = null;
	var BlockingKeyboard = new Class({
		Extends: Keyboard,
		handle: function(event, type) {
			if(document.activeElement == editingShortcutField) {
				var type_keys = type.split(":");
				if(type_keys[1].contains('tab')) {
					return;
				}
				if(type_keys[1] === "") {
					return;
				}
				event.stop();
				if(type_keys[1].contains('backspace')) {
					type_keys[1] = "";
				}
				if(type_keys[0] == "keydown") {
                    setTimeout(function() {
                        // For some reason, calling event.stop() isn't
                        // enough to stpo opera from adding the key to the textfield
                        // This little hack seems to work, however
                        editingShortcutField.value = type_keys[1];
                    }, 0);
					editingShortcutField.shortcut.keys = type_keys[1];
					highlightDuplicates();
				}
			}
			if(!timer.timing && timer.isFocused() && !timer.keysDown() && !timer.pendingTime) {
				this.parent(event, type);
			}
		}
	});

	function resizeScrambleArea(delta) {
		var scrambleSpace = configuration.get('layout.sizerHeight');
		scrambleSpace += delta;
		configuration.set('layout.sizerHeight', scrambleSpace);
		triLayout.resize();
	}
	function scrollTable(delta) {
		return function(e) {
			e.stop();
			var pos;
			if(delta == Infinity) {
				pos = timesTable.tbody.scrollHeight;
			} else if(delta == -Infinity) {
				pos = 0;
			} else {
				pos = timesTable.tbody.scrollTop + delta;
			}
			timesTable.tbody.scrollTo(0, pos);
		};
	}

	var keyboard = new BlockingKeyboard();
	tnoodle.tnt.KEYBOARD_TIMER_SHORTCUT = 'Start timer (try "a+;")';
	var shortcuts = new Hash({
		'Times': [
			{
				description: tnoodle.tnt.KEYBOARD_TIMER_SHORTCUT,
				'default': 'space',
				handler: null
			},
			{
				description: 'Comment on last solve',
				'default': 'c',
				handler: timesTable.comment.bind(timesTable)
			},
			{
				description: 'Add time',
				'default': 'alt+a',
				handler: timesTable.promptTime.bind(timesTable)
			},
			{
				description: 'No penalty',
				'default': 'i',
				handler: timesTable.penalize.bind(timesTable, null)
			},
			{
				description: '+2',
				'default': 'o',
				handler: timesTable.penalize.bind(timesTable, '+2')
			},
			{
				description: 'DNF',
				'default': 'p',
				handler: timesTable.penalize.bind(timesTable, 'DNF')
			},
			{
				description: 'Undo',
				'default': 'control+z',
				handler: timesTable.undo.bind(timesTable)
			},
			{
				description: 'Redo',
				'default': 'control+y',
				handler: timesTable.redo.bind(timesTable)
			}
		],
		'Sessions': [
			{
				description: 'Reset session',
				'default': 'r',
				handler: function() {
					if(confirm("Are you sure you want to reset the session?")) {
						resetSession();
					}
				}
			},
			{
				description: 'Delete session',
				'default': 'd',
				handler: deleteSession
			},
			{
				description: 'New session',
				'default': 'n',
				handler: function() {
					if(confirm("Are you sure you wish to create a new session?")) {
						newSession();
					}
				}
			},
			{
				description: 'Comment on session',
				'default': 'shift+c',
				handler: $('sessionComment').focus.bind($('sessionComment'))
			}
		],
		'Gui stuff': [
			{
				description: '+10px scramble area',
				'default': '=',
				handler: resizeScrambleArea.bind(null, 10)
			},
			{
				description: '-10px scramble area',
				'default': '-',
				handler: resizeScrambleArea.bind(null, -10)
			},
			{
				description: '+50px scramble area',
				'default': 'shift+=',
				handler: resizeScrambleArea.bind(null, 50)
			},
			{
				description: '-50px scramble area',
				'default': 'shift+-',
				handler: resizeScrambleArea.bind(null, -50)
			},
			{
				description: 'Toggle scramble view',
				'default': 's',
				handler: scrambleStuff.toggleScrambleView
			},
			{
				description: 'Scroll up times table',
				'default': 'pageup',
				handler: scrollTable(-100)
			},
			{
				description: 'Scroll down times table',
				'default': 'pagedown',
				handler: scrollTable(100)
			},
			{
				description: 'Scroll to top of times table',
				'default': 'home',
				handler: scrollTable(-Infinity)
			},
			{
				description: 'Scroll to bottom of times table',
				'default': 'end',
				handler: scrollTable(Infinity)
			}
		],
		'Miscellaneous': [
			{
				description: 'Help',
				'default': 'shift+/',
				handler: $('helpLink').doClick
			},
			{
				description: 'Select puzzle',
				'default': 'q',
				handler: scrambleStuff.puzzleSelect.show
			},
			{
				description: 'Select event',
				'default': 'w',
				handler: eventSelect.show
			},
			{
				description: 'Select session',
				'default': 'e',
				handler: sessionSelect.show
			}
		]
	});
	function getShortcutKeys(shortcut) {
		var keys = shortcut.keys;
		if(keys === null || keys === undefined) {
			keys = shortcut['default'] || '';
		}
		return keys;
	}
	function getShortcutMap() {
		var shortcutMap = {};
		shortcuts.getValues().each(function(category) {
			category.each(function(shortcut) {
				var keys = getShortcutKeys(shortcut);
				var shortArr = shortcutMap[keys];
				if(!shortArr) {
					shortArr = [];
					shortcutMap[keys] = shortArr;
				}
				shortArr.push(shortcut);
			});
		});
		return new Hash(shortcutMap);
	}

	shortcuts.getValues().each(function(category) {
		category.each(function(shortcut) {
			var keys = configuration.get('shortcuts.' + shortcut.description, null);
			shortcut.keys = keys;
		});
	});


    function keyStopper(func) {
        return function(e) {
            e.stop();
            // Silly hack for opera. Apparently calling stop() isn't enough
            // to stop keypress events from entering text into a textfield.
            setTimeout(func, 0);
        };
    }
	// NOTE: We don't need to explicitly call this function in
	//       order to initialize stuff, because the onHide() method
	//       calls it, and onHide() is called by createPopup().
	function addShortcutListeners() {
		keyboard.removeEvents();
		getShortcutMap().getValues().each(function(shortcuts) {
			for(var i = 0; i < shortcuts.length; i++) {
				var shortcut = shortcuts[0];
				var keys = shortcut.keys;
				configuration.set('shortcuts.' + shortcut.description, keys);
				keys = getShortcutKeys(shortcut);
				if(keys !== '' && shortcuts.length == 1 && shortcut.handler) {
					// If we have duplicate shortcuts, don't program any of them
					// Note that we still save all the settings to configuration
					keyboard.addEvent(keys, keyStopper(shortcut.handler));
				}
			}
		});
	}
	function highlightDuplicates() {
		//TODO - do something more clever to detect n & n+m
		getShortcutMap().getValues().each(function(shortcuts) {
			var duplicates = shortcuts.length > 1;
			for(var i = 0; i < shortcuts.length; i++) {
				var shortcut = shortcuts[i];
				shortcut.editor.setStyle('color', '');
				shortcut.editor.setStyle('border-color', '');
				if(getShortcutKeys(shortcut) !== '' && duplicates) {
					shortcut.editor.setStyle('color', 'red');
					shortcut.editor.setStyle('border-color', 'red');
				}
			}
		});
	}
	function onHide() {
		addShortcutListeners();
	}

	var helpPopup = tnoodle.tnt.createPopup(null, onHide);

	helpPopup.refresh = function() {
		helpPopup.empty();
		var shortcutsDiv = document.createElement('div');
		shortcutsDiv.setStyle("overflow", 'auto');
		helpPopup.overflow = function() {
			var size = helpPopup.getParent().getSize();
			shortcutsDiv.setStyle("height", size.y-40);
			shortcutsDiv.setStyle("margin-right", '');
		};
		helpPopup.reset = function() {
			//TODO - wow this is nasty
			shortcutsDiv.setStyle("height", '');
			shortcutsDiv.setStyle("width", '');
			shortcutsDiv.setStyle("margin-right", 21);
		};
		helpPopup.appendChild(shortcutsDiv);
		shortcuts.getKeys().each(function(category) {
			var categorySpan = document.createElement('span');
			categorySpan.appendText(category);
			categorySpan.setStyle('font-weight', 'bold');
			shortcutsDiv.appendChild(categorySpan);
			shortcuts[category].each(function(shortcut) {
				var shortcutDiv = document.createElement('div');
				shortcutDiv.setStyle('margin-left', 10);

				var label = document.createElement('label');
				label.setStyle('font-size', '12px');
				label.setStyle('float', 'left');
				//label.setStyle('margin-left', 10);
				label.setStyle('width', 200);
				label.appendText(shortcut.description + ':');
				shortcutDiv.appendChild(label);

				var textField = document.createElement('input');
				textField.setStyle('width', 60);
				textField.type = 'text';
				textField.value = getShortcutKeys(shortcut);
				textField.shortcut = shortcut;
				textField.addEvent('keydown', function(e) {
					if(e.key == 'esc') {
						// If we don't stop the event, then the popup will disappear
						e.stop();
						this.blur();
					}
				});
				//TODO - check for copy paste, does keyup really work?
				//textField.addEvent('keyup', function(e) {
					//this.shortcut.keys = this.value;
					//highlightDuplicates();
				//});
				textField.addEvent('focus', function() {
					editingShortcutField = this;
				});
				//textField.addEvent('change', function() {
					//this.shortcut.keys = this.value;
					//highlightDuplicates();
				//});
				shortcutDiv.appendChild(textField);
				shortcut.editor = textField;

				shortcutsDiv.appendChild(shortcutDiv);
			});
		});
		highlightDuplicates();
		var reset = document.createElement('input');
		reset.type = 'button';
		reset.value = 'Reset';
		reset.addEvent('click', function() {
			if(!confirm('This will reset all shortcuts! Are you sure you wish to continue?')) {
				return;
			}
			shortcuts.getValues().each(function(category) {
				category.each(function(shortcut) {
					shortcut.keys = shortcut['default'] || '';
				});
			});
			helpPopup.refresh();
		});
		helpPopup.appendChild(reset);
	};

	$('bgLink').reset = function() {
		$('bgLink').empty();
		$('bgLink').appendText('Set background');
	};
	var bgImg = $$('.background')[0];
	var bgImgSize = null;
	function setBgUrl(url) {
		if(url === undefined || url === null) {
			url = "";
		}
		configuration.set('gui.backgroundImage', url);
		if(url === "") {
			$('bgLink').reset();
			bgImg.setStyle('display', 'none');
			window.removeEvent('resize', resizeBgImg);
		} else {
			if(bgImg.src == url) {
				// This is more efficient + the load event won't
				// fire if we don't change the src
				return;
			}
			$('bgLink').empty();
			$('bgLink').appendText('Loading...');
			bgImgSize = null;
			bgImg.src = url;
			bgImg.setStyle('display', 'inline');
			bgImg.setStyle('width', '');
			bgImg.setStyle('height', '');
			// neat little trick to keep the image from showing up until it has loaded
			bgImg.setStyle('opacity', '0');
			bgImg.addEvent('load', function() {
				$('bgLink').reset();
				bgImgSize = bgImg.getSize();
				resizeBgImg();
				bgImg.setStyle('opacity', '1');
			});
			bgImg.addEvent('error', function() {
				$('bgLink').reset();
				$('bgLink').appendText(' (failed to load: ' + url + ')');
			});
			window.addEvent('resize', resizeBgImg);
		}
	}
	function resizeBgImg() {
		if(bgImgSize === null) {
			// image hasn't loaded yet, so there's nothing we can do
			return;
		}
		var available = document.body.getSize();
		var height = available.y;
		var width = Math.max(available.x, available.y * (bgImgSize.x/bgImgSize.y));
		height = width * bgImgSize.y/bgImgSize.x;
		bgImg.setStyle('width', width);
		bgImg.setStyle('height', height);

		bgImg.setStyle('left', (available.x - width) / 2);
		bgImg.setStyle('top', (available.y - height) / 2);
	}
	$('bgLink').addEvent('click', function() {
		var url = prompt("Url?", configuration.get('gui.backgroundImage')); 
		if(url !== null) {
			setBgUrl(url);
		}
	});
	setBgUrl(configuration.get('gui.backgroundImage', ''));
});