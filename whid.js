var templates = {};

$(document).ready(function() {
  initUsernameField();

  Handlebars.registerHelper('showBug', function(id) {
    return 'https://bugzilla.mozilla.org/show_bug.cgi?id=' + id;
  });

  Handlebars.registerPartial('bugTooltip', 'Bug {{id}} - {{summary}}');

  templates['newBugs'] = Handlebars.compile($('#newBugsTemplate').html());
});

function initUsernameField() {
  var defaultText = 'Bugzilla e-mail';
  $('#username').focus(function() {
    $(this).removeClass('defaultText');
    if ($(this).attr('value') == defaultText) {
      $(this).attr('value', '');
    }
  });

  $('#username').blur(function() {
    if ($(this).attr('value') == '') {
      $(this).addClass('defaultText');
      $(this).attr('value', defaultText);
    }
  });

  var lastUsername = localStorage.getItem('lastUsername');
  if (!lastUsername) {
    $('#username').addClass('defaultText');
    $('#username').attr('value', defaultText);
  }
  else {
    $('#username').attr('value', lastUsername);
  }


  $('#username').keypress(function(e) {
    if (e.which == 13) {
      // TODO: Clear old stuff
      var username = $('#username').attr('value');
      localStorage.setItem('lastUsername', username);
      getBugs(username);
    }
  });

}

function getBugs(login) {
  var req = new XMLHttpRequest();
  var apiURL = 'https://api-dev.bugzilla.mozilla.org/1.1/';
  var url = apiURL + 'bug?' + encodeReqParams({
    email1: login,
    email1_type: 'equals',
    email1_assigned_to: 1,
    changed_after: '2012-04-05',
    /*include_fields: 'id,creator,assigned_to,summary,keywords,whiteboard,status,resolution'*/
    include_fields: 'id,summary,creator,creation_time'
    /*email1_comment_author: 1*/ // broken, bug 743275
  });

  if (!$('#nocache').attr('checked')) {
    var cachedResult = localStorage.getItem(url);
    if (cachedResult) {
      console.debug('Got cached value!');
      displayBugs(JSON.parse(cachedResult), login);
      return;
    }
  }

  console.debug('GET: ' + url);

  req.open('GET', url, /* async = */ true);
  req.setRequestHeader('Accept', 'application/json');
  req.onreadystatechange = function(e) {
    if (req.readyState == 4) {
      getBugsFinished(url, req, login);
    }
  };
  req.send();
}

function encodeReqParams(dict) {
  var ret = "";
  for (k in dict) {
    ret += k + '=' + encodeURIComponent(dict[k]) + '&';
  }
  return ret;
}

function getBugsFinished(url, req, login) {
  if (req.status >= 300 || req.status < 200) {
    $('#requestOutput').text('Error ' + req.status + ' ' + req.responseText);
    return;
  }

  try {
    var bugs = JSON.parse(req.responseText);
    console.debug('Calling displayBugs: ' + req.responseText);
  }
  catch(e) {
    $('#requestOutput').text('Received invalid JSON: ' + req.responseText);
  }

  localStorage.setItem(url, JSON.stringify(bugs.bugs));
  displayBugs(bugs.bugs, login);
}

function displayBugs(bugs, login) {
  var now = Date.now();
  var weekMS = 7 * 24 * 60 * 60 * 1000;
  var outBugs = {created: []};

  for (var i = 0; i < bugs.length; i++) {
    var bug = bugs[i];
    bug.creation_time = new Date(bug.creation_time);

    if (bug.creator.name == 'justin.lebar+bug' &&
        (now - bug.creation_time.getTime()) <= weekMS) {
      outBugs.created.push(bug);
    }
    else {
      console.debug('Bug delta: ' + (now - bug.creation_time.getTime()));
    }
  }

  $('#newBugsList').html(templates.newBugs(outBugs));
}
