//naive way of assuming mobile
var isMobile = window.screen.width < window.screen.height ? true : false
var width = isMobile ?
  window.devicePixelRatio * window.screen.width :
  screen.width;
var height = isMobile ?
  window.devicePixelRatio * window.screen.height :
  screen.height;

var container = d3.select('#ubahn-map');
var focusStations;
var mapData;

// replace spaces with underscores and German characters with
// their English correspondent
// Example:
//   'Görlitzer Bahnhof' -> 'Goerlitzer_Bahnhof'
function imageName(str) {
  var umlautMap = {
    '\u00dc': 'UE',
    '\u00c4': 'AE',
    '\u00d6': 'OE',
    '\u00fc': 'ue',
    '\u00e4': 'ae',
    '\u00f6': 'oe',
    '\u00df': 'ss',
  }

  return str
    .replace(/[\u00dc|\u00c4|\u00d6][a-z]/g, function(a) {
      var big = umlautMap[a.slice(0, 1)];
      return big.charAt(0) + big.charAt(1).toLowerCase() + a.slice(1);
    })
    .replace(new RegExp('[' + Object.keys(umlautMap).join('|') + ']', 'g'),
      function(a) { return umlautMap[a] }
    )
    .replace(/ /g,'_');
}

function handleImageColor() {
  if (Cookies.get('grayscale-photos') === 'true') {
    $('.wiki-image').css(
      {'filter': 'grayscale(100%)', '-webkit-filter': 'grayscale(100%)'})
  }
}

function getWikiData(station, wikiMeta) {
  $('#sidebar-content-container').html('')
  var imagePath = wikiMeta.image_cache ?
    concat('articles/images/', imageName(station.name), '.jpg') :
    null

  if (wikiMeta.image_cache) {
    preloadImage(imagePath)
  }

  if (wikiMeta.en_wiki_cache) {
    $.ajax({
      url: 'articles/html/' + station.name + '.html',
      success: function(data) {
        showSidebar(
          concat(
            '<div class="wiki-body"><img class="wiki-image" src="',
            imagePath, '">', data, '</div>', addendum(wikiMeta, 'en')
          )
        )
        handleImageColor()
        $(".main-footer").hide();
      }
    });
  }

}

function preloadImage(url) {
  var img = new Image();
  img.src = url;
  return img.src
}

function classFromName(currentName) {
  return currentName.replace(/[()0-9 ]/g,'');
}

function normalizeStationName(stationName) {
  return stationName.replace(/[0-9]/g, '').trim()
}

function removeHighlight() {
  var fs = window.focusStations;

  if (fs) {
    d3.selectAll('.station.'.concat(classFromName(fs.current.name)))
      .attr('fill', 'white')
      .attr('current', 'false')
  }
}

function showWikiData(station) {
  removeHighlight();

  // highlight current station
  d3
    .selectAll('.station.'.concat(classFromName(station.name)))
    .attr('fill', 'black')
    .attr('current', true)

  function showOpenStreetMapLink(lat, lon) {
    $('#sidebar-footer').html(
      concat(
        '<b>coordinates</b> <a href="https://www.openstreetmap.org/?mlat=',
        lat, '&mlon=', lon, '&zoom=16" target="_blank">', lat, ', ',
        lon, '</a>'
      )
    )
  }

  // if current line name is not defined, get the line with lowest number
  var wikiMeta = window.mapData.meta[station.name];

  station.currentLineName = station.currentLineName ||
    getStationLines(station.name, window.mapData.lines)[0];
  station.servingLinesNames = getStationLines(
    station.name, window.mapData.lines);

  window.focusStations = stationNeighbours(
    station,
    window.mapData.lines,
    window.mapData.stations
  );
  window.focusStations.current = station;

  getWikiData(station, wikiMeta);

  showLinesForStation(station.servingLinesNames)
  showOpenStreetMapLink(
    station.position.lat,
    station.position.lon,
  );
}

var map = d3
  .tubeMap()
  .width(width)
  .height(height)
  .on('click', function(data) {
    showWikiData(data);
  });

d3.json('./json/berlin-ubahn.json').then(function(data) {
  d3.json('./json/meta.json').then(function(metaData) {
    container.datum(data).call(map);
    var _data = map.data();

    window.mapData = {
      meta: metaData,
      lines: _data.lines,
      stations: _data.stations
    }

    map.drawAll(Cookies.get())

    var svg = container.select('svg');

    zoom = d3
      .zoom()
      .scaleExtent([0.7, 10])
      .on('zoom', zoomed);

    var zoomContainer = svg.call(zoom);
    var initialScale = 1;
    var initialTranslate = [0, height / 25];

    zoom.scaleTo(zoomContainer, initialScale);
    zoom.translateTo(
      zoomContainer,
      initialTranslate[0],
      initialTranslate[1]
    );

    function zoomed() {
      svg.select('g').attr('transform', d3.event.transform.toString());
    }
  })

});

function showSidebar(sidebarHtml) {
  $("#sidebar").show();
  $('#sidebar-content-container').html(
    concat('<div id="wiki-content">', sidebarHtml, '</div>')
  )
}

// return article addendum (article sources and image source)
function addendum(addendumObject, language) {
  wikiCache = addendumObject[language + '_wiki_cache']
  wikiSources = addendumObject[language + '_wiki_sources']
  imageSource = addendumObject.image_cache && addendumObject.image_source ?
    addendumObject.image_source :
    ''
  addendumSection = '';
  



  return concat('<p class="addendum">', addendumSection, '</p>')
}

// Helper to concatenate strings without the plus sign
function concat() {
  concatenated = "";
  for (var i = 0; i < arguments.length; i++) {
    concatenated += arguments[i];
  }
  return concatenated;
}

// Get next and previous stations on the same line, or if
// it's the first or last stop of the line, the neighbours are
// decided chronoligcally.
//
// Examples:
//   - for last station of U6, the next neighbour is the first station of U7
//   - for the first station of U1, the previous neighbour is the last station
//     of U9
function stationNeighbours(station, lines, stations) {
  var line = lines.find(l => l.name == station.currentLineName);
  var stationName = normalizeStationName(station.name);
  var indexOfStation = line.stations.indexOf(stationName);
  var indexOfLine = lines.indexOf(line);
  var n;
  var p;

  if (indexOfStation != 0 && indexOfStation != line.stations.length - 1) {
    n = stations[line.stations[indexOfStation + 1]];
    p = stations[line.stations[indexOfStation - 1]];
    n.currentLineName = line.name;
    p.currentLineName = line.name;

  } else if (indexOfStation == 0) {
    n = stations[line.stations[indexOfStation + 1]];
    n.currentLineName = line.name;

    if (indexOfLine == 0) {
      p = stations[lines[lines.length - 1].stations.slice(-1)[0]];
      p.currentLineName = lines[lines.length - 1].name;
    } else {
      p = stations[lines[indexOfLine - 1].stations.slice(-1)[0]]
      p.currentLineName = lines[indexOfLine - 1].name
    }

  } else {
    p = stations[line.stations[indexOfStation - 1]];
    p.currentLineName = line.name;

    if (indexOfLine == lines.length - 1) {
      n = stations[lines[0].stations[0]];
      n.currentLineName = lines[0].name;
    } else {
      n = stations[lines[indexOfLine + 1].stations[0]];
      n.currentLineName = lines[indexOfLine + 1].name;
    }
  }

  return {
    next: n,
    previous: p
  }
}

function getStationLines(stationName, lines) {
  var stationLines = [];

  for (var i = 0;  i < lines.length; i++) {
    var indexOfStation = lines[i].stations
      .indexOf(normalizeStationName(stationName));
    if (indexOfStation !== -1) {
      stationLines.push(lines[i].name)
    }
  }

  return stationLines.sort();
}

$('body').on('click', 'a.station-navigator', function() {
  var direction = $(this).attr('id');
  showWikiData(window.focusStations[direction]);
});

// navigate the stations with the left-right arrow keys
$(document).on("keydown", 'body', function (event) {
  if ($('#sidebar').is(':visible')) {
    if (event.keyCode == 37) {
      showWikiData(window.focusStations.previous);
    }
    if (event.keyCode == 39) {
      showWikiData(window.focusStations.next);
    }
  }
});

$(document).ready(function() {
  $('.fake-link').click(function(event){
    event.preventDefault();
  });

  if ($(window).width() >= 1001) {
    $('#sidebar').resizable({
      handles: 'e'
    });
  }

  $("#close-link").click(function() {
    removeHighlight();
    $("#sidebar").hide();
  });
});
