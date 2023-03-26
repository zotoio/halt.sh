function terminal(file, callback) {
	$.getJSON('/' + file, function(data) { 
		var i = 0;
		var rand = 1;
		function doLine() {

			var min = 1,
			max = 15;
			i++;

			if (i % 10) rand = Math.floor(Math.random() * (max - min + 1) + min);

			var lines = "";
			for (j = 0; j<rand; j++) {
				var line = data.shift();
				if (line) lines += line.replace(/\s/g, '&nbsp;');
				if (data.length > 0) lines += '<br>';	
			}

			if (lines) {
				$('.console').append(lines);
				setTimeout(doLine, rand * max);	
				window.scrollTo(0,document.body.scrollHeight);	
			} else {
				bash();
				window.scrollTo(0,document.body.scrollHeight);	
				if (callback) callback();
			}
			
		}
		doLine();
    }); 
}	

function menu() {
	setTimeout(function() {$('.console').append('ls -l<br>');setTimeout(function() {terminal('ls.json'), contact()}, 500);}, 500);
}

function contact() {
	setTimeout(function() {$('.console').append('cat contact.txt<br>');setTimeout(function() {terminal('contact.json')}, 500);}, 500);
}

function bash() {
	$('.console').append('<br>root&#64;<span class="hostname">' + hostname + '</span>:~# ');
}

setTimeout(function() {
		terminal('boot.json', function() {
		terminal('splash.json', function() {
		menu()})}
	)}, 3000);	
