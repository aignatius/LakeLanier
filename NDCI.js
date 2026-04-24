//// Script by Dr. Amber Ignatius and Adam Freeland, UNG IESA. GISC4490 spring 2022 ////
//// Script to calculate NDCI for Lake Sidney Lanier watershed //// 
//// note: Lake Lanier boundary uses a 42m negative buffer to exclude land //// 
//// based on 20m pixel (band 5) and 3 X 3 pixel window of 60m radius 42m (Clark et al 2017) //// 

var meanNDCI = ee.Image("users/arignatius/Lanier_meanNDCI"),
    Lake_Lanier = ee.FeatureCollection("users/arignatius/Lanier_NHDGSW_42m");

var endDate = ee.Date(Date.now());
var startDate = '2018-01-01';

// Import image collection 
var s2filter = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
  .filterBounds(Lake_Lanier);

//additional cloud mask function
function maskS2clouds(image) {
  var qa = image.select('QA60')
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
            qa.bitwiseAnd(cirrusBitMask).eq(0))
  return image.updateMask(mask)//.divide(10000)
      .select("B.*")
      .copyProperties(image, ["system:time_start"])
}
var s2filterMore = s2filter.map(maskS2clouds)

//creates a function to compute NDCI for an image and adds it as a band
function addNDCI(image) {
  var ndci = image.expression(
      "(RedEdge - RED) / (RedEdge + RED)",
      {
      RED: image.select("B4"),    //  RED
      RedEdge: image.select("B5"),    // red edge
      })
    .rename('ndci');
    return image.addBands(ndci);
}

//map the NDCI function over the image collection
var withNdci = s2filterMore.map(addNDCI);

var valueNdci = withNdci.select('ndci');

//viridis color palette
var vis = {min: -.15 , max : -.05, palette : ['#481567FF','#482677FF','#453781FF','#404788FF','#39568CFF',
                                              '#33638DFF','#2D708EFF','#287D8EFF','#238A8DFF','#1F968BFF',
                                              '#20A387FF','#29AF7FFF','#3CBB75FF','#55C667FF',
                                              '#73D055FF','#95D840FF','#B8DE29FF','#DCE319FF','#FDE725FF' 
]};


var composite = valueNdci.mean().visualize(vis);
var compositeLayer = ui.Map.Layer(composite).setName('Average NDCI, 2019-present');


var selectNDCI = meanNDCI.select('NDCI').visualize(vis);
var baseNDCI = ui.Map.Layer(selectNDCI).setName('Average NDCI, 2018-present');



///////////////////


// Create the main map and set the temp layer.
var mapPanel = ui.Map().setOptions('SATELLITE');
var layers = mapPanel.layers();
layers.add(baseNDCI, 'NDCI');
//layers.add(compositeLayer, 'Composite');



/*
 * Panel setup
 */

// Create a panel to hold title, intro text, chart and legend components.
var inspectorPanel = ui.Panel({style: {width: '30%'}});

// Create an intro panel with labels.
var intro = ui.Panel([
  ui.Label({
    value: 'Lake Lanier - Chlorophyll NDCI Timeseries',
    style: {fontSize: '20px', fontWeight: 'bold'}
  }),
  ui.Label('Click a location to graph Sentienl-2 satellite-derived Normalized Difference Chlorophyll Index (NDCI) estimates over time where NDCI = (Red edge 1 − Red) / (Red edge 1 + Red) (https://doi.org/10.1016/j.rse.2011.10.016). The graph is generated using hundreds of satellite observations and may take several seconds to process.'),
    ui.Label('Data provide raw spectral index values. Estimates are provisional and have not been validated for all dates/locations. This preliminary data may help identify spatiotemporal patterns and support future research.'),
    ui.Label('Interactive map by Dr. Amber Ignatius and IESA students Z. Boyd, A. Freeland, C. Jackson, B. Mann, and K. Perry using GEE code. www.VisualEcoGeo.com')
]);
inspectorPanel.add(intro);

// Create panels to hold lon/lat values.
var lon = ui.Label();
var lat = ui.Label();
inspectorPanel.add(ui.Panel([lon, lat], ui.Panel.Layout.flow('horizontal')));

// Add placeholders for the chart and legend.
inspectorPanel.add(ui.Label('[Chart]'));
inspectorPanel.add(ui.Label('[Legend]'));


/*
 * Chart setup
 */

// Generates a new time series chart of SST for the given coordinates.
var generateChart = function (coords) {
  // Update the lon/lat panel with values from the click event.
  lon.setValue('lon: ' + coords.lon.toFixed(2));
  lat.setValue('lat: ' + coords.lat.toFixed(2));

  // Add a dot for the point clicked on.
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  var dot = ui.Map.Layer(point, {color: '000000'}, 'clicked location');
  // Add the dot as the second layer, so it shows up on top of the composite.
  mapPanel.layers().set(1, dot);

  // Make a chart from the time series.
  var sstChart = ui.Chart.image.series(valueNdci, point, ee.Reducer.mean(), 500);

  // Customize the chart.
  sstChart.setOptions({
    title: 'Click the small arrow (right) to download data',
    vAxis: {title: 'NDCI'},
    hAxis: {title: 'Date', format: 'MM-yy', gridlines: {count: 7}},
    series: {
      0: {
        color: 'blue',
        lineWidth: 0,
        pointsVisible: true,
        pointSize: 2,
      },
    },
    legend: {position: 'right'},
  });
  // Add the chart at a fixed position, so that new charts overwrite older ones.
  inspectorPanel.widgets().set(2, sstChart);
};


/*
 * Legend setup
 */

// Creates a color bar thumbnail image for use in legend from the given color palette.
function makeColorBarParams(palette) {
  return {
    bbox: [0, 0, 1, 0.1],
    dimensions: '100x10',
    format: 'png',
    min: -.2,
    max: 1,
    palette: palette,
  };
}

// Create the color bar for the legend.
var colorBar = ui.Thumbnail({
  image: ee.Image.pixelLonLat().select(0),
  params: makeColorBarParams(vis.palette),
  style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'},
});

// Create a panel with three numbers for the legend.
var legendLabels = ui.Panel({
  widgets: [
    ui.Label(vis.min, {margin: '4px 8px'}),
    ui.Label(
        (vis.max / 2),
        {margin: '4px 8px', textAlign: 'center', stretch: 'horizontal'}),
    ui.Label(vis.max, {margin: '4px 8px'})
  ],
  layout: ui.Panel.Layout.flow('horizontal')
});

var legendTitle = ui.Label({
  value: 'Map Legend: mean NDCI, 2018-present',
});

var legendPanel = ui.Panel([legendTitle, colorBar, legendLabels]);
inspectorPanel.widgets().set(3, legendPanel);

/*
 * Map setup
 */

// Register a callback on the default map to be invoked when the map is clicked.
mapPanel.onClick(generateChart);

// Configure the map.
mapPanel.style().set('cursor', 'crosshair');


// Initialize with a test point.
//var initialPoint = ee.Geometry.Point(-83.86, 34.34);
var initialPoint = ee.Geometry.Point(-83.93, 34.29);
mapPanel.centerObject(initialPoint, 12);


/*
 * Initialize the app
 */

// Replace the root with a SplitPanel that contains the inspector and map.
ui.root.clear();
ui.root.add(ui.SplitPanel(inspectorPanel, mapPanel));

generateChart({
  lon: initialPoint.coordinates().get(0).getInfo(),
  lat: initialPoint.coordinates().get(1).getInfo()
});


