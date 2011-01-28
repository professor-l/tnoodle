window.addEvent('domready', function() {
	var server = new tnoodle.server();
	var configuration = server.configuration;
	
	function onPuzzlesLoaded(puzzles) {
		var puzzle = configuration.get('scramble.puzzle', '3x3x3');
		scrambleStuff.setSelectedPuzzle(puzzle);
	}
	var scrambleStuff = new ScrambleStuff(configuration, onPuzzlesLoaded);
	document.getElementById('puzzleChooser').appendChild(scrambleStuff.puzzleSelect);
	document.getElementById('scrambleArea').appendChild(scrambleStuff.scrambleArea);

	var timer = new KeyboardTimer($('timer'), server, scrambleStuff);
	var session = null;
	
	scrambleStuff.addPuzzleChangeListener(function(newPuzzle) {
		eventSelect.refresh();
	});

	function getEvents() {
		return server.getEvents(scrambleStuff.getSelectedPuzzle());
	}
	var eventSelect = new Element('select');
	eventSelect.refresh = function() {
		var events = getEvents();
		eventSelect.options.length = events.length;
		for(var i = 0; i < events.length; i++) {
			eventSelect.options[i] = new Option(events[i], events[i]);
		}
		var editOption = new Option('Edit', null);
		editOption.setStyle('background-color', 'white');
		eventSelect.options[eventSelect.options.length] = editOption;

		var event = configuration.get('scramble.puzzle.event', '');
		var oldValue = eventSelect.value;
		eventSelect.value = event;
		if(oldValue == event) {
			// Hack to fire the onchange event even if nothing changed.
			eventSelect.onchange();
		}
	};
	$('puzzleChooser').adopt(eventSelect);

	eventSelect.onchange = function(e) {
		if(eventSelect.value === "null") {
			// We don't want to leave the "Edit" option selected
			eventSelect.value = session.getEvent() || '';
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
		sessionSelect.refresh();
	}; //for some reason, the change event doesn't fire until the select loses focus

	var sessionSelect = new Element('select');
	$('puzzleChooser').adopt(sessionSelect);
	sessionSelect.refresh = function() {
		var puzzle = scrambleStuff.getSelectedPuzzle();
		var event = eventSelect.value;

		var options = sessionSelect.options;

		var editOption = new Option('New session', null);
		editOption.setStyle('background-color', 'white');
		options[0] = editOption;

		var sessions = server.getSessions(puzzle, event);
		sessions.reverse(); // We want to list our sessions starting with the most recent
		if(sessions.length === 0) {
			sessions.push(server.createSession(puzzle, event));
		}
		options.length = sessions.length;
		for(var i = 0; i < sessions.length; i++) {
			options[1+i] = new Option(sessions[i].getDate().format('%b %d, %Y %H:%M'), sessions[i]);
			options[1+i].session = sessions[i];
		}
		session = sessions[0];
		options.selectedIndex = 1;
		sessionSelect.onchange();
	};
	sessionSelect.onchange = function(e) {
		var puzzle = scrambleStuff.getSelectedPuzzle();
		var event = eventSelect.value;
		if(sessionSelect.selectedIndex === 0) {
			// We create a new session, and then refresh our list
			// Refreshing will cause the newest session to be selected
			server.createSession(puzzle, event);
			sessionSelect.refresh();
			return;
		}
		session = sessionSelect.options[sessionSelect.selectedIndex].session;
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
		if(confirm("Are you sure you want to reset the session?")) {
			timesTable.reset();
		}
	}
	function deleteSession() {
		if(confirm("Are you sure you want to delete the session?")) {
			server.disposeSession(session);
			sessionSelect.refresh(); // This will cause the latest session to be selected
		}
	}
	
	var timesTable = new TimesTable($('timesTable'), server, scrambleStuff);
	timer.addEvent('newTime', function(time) {
		//TODO - this may need to way for the sessions to load...
		timesTable.addTime(time);
	});
	
	$('resetSession').addEvent('click', resetSession);
	$('deleteSession').addEvent('click', deleteSession);
	$('downloadCSV').addEvent('click', downloadCSV);
	$('downloadCSV').addEvent('mousedown', downloadCSV);

	$('timer').resize = function() {
		timer.redraw();
	};
	$('scrambles').resize = scrambleStuff.resize;
	$('times').resize = function() {
		var remainingHeight = $('times').getSize().y - $('timesArea').getStyle('border-top').toInt() - $('timesArea').getStyle('border-bottom').toInt();
		$('timesArea').setStyle('height', remainingHeight);
		
		timesTable.resize();
	};
	$('times').getPreferredWidth = function() {
		return timesTable.getPreferredWidth();
	};

	
	var triLayout = new TriLayout($('timer'), $('scrambles'), $('times'), configuration);
	timesTable.manager = triLayout;
	
	//TODO - yeah...
	aboutText = '<h2>TNoodle Timer (TNT) vFOOOBAR</h2><br/>' +
				'Created by Jeremy Fleischman from the ashes of CCT.<br/>' +
				'Thanks to Leyan Lo for ideas/couch';
	$('aboutLink').addEvent('click', function() {
		var popup = tnoodle.tnt.createPopup();
		popup.innerHTML = aboutText;
		popup.show();
	});
	
	// This wraps functions to ensure that they
	// only get called if we're not timing
	// This is useful so keyboard shortcuts won't work
	// while the timer is running
	function notTiming(func) {
		return function(e) {
			var focusedEl = document.activeElement.nodeName.toLowerCase();
			// This is kinda weird, we want to avoid activating this shortcut
			// if we're in a textarea, textfield, or input field
			var isEditing = focusedEl == 'textarea' || focusedEl == 'textfield' || focusedEl == 'input';
			if(!timer.timing && !isEditing) {
				func(e);
			}
		};
	}
	var keyboard = new Keyboard();
	keyboard.addShortcut('save', {
	    'keys': 'c',
	    'description': 'Comment on latest solve',
	    'handler': notTiming(timesTable.comment.bind(timesTable))
	});
	keyboard.addShortcut('add time', {
		'keys': 'alt+a',
		'description': 'Add time',
		'handler': function(e) { e.stop(); timesTable.promptTime(); }
	});
	keyboard.addShortcut('reset', {
		'keys': 'alt+r',
		'description': 'Reset session',
		'handler': resetSession
	});
	keyboard.addShortcut('undo', {
		'keys': 'ctrl+z',
		'description': 'Undo',
		'handler': notTiming(timesTable.undo.bind(timesTable))
	});
	keyboard.addShortcut('redo', {
		'keys': 'ctrl+y',
		'description': 'Redo',
		'handler': notTiming(timesTable.redo.bind(timesTable))
	});
});