﻿'use strict';

var moment = require('moment');
moment = typeof (moment) === 'function' ? moment : window.moment;

module.exports = function (Chart) {

	var helpers = Chart.helpers;
	var interval = {
		millisecond: {
			size: 1,
			steps: [1, 2, 5, 10, 20, 50, 100, 250, 500]
		},
		second: {
			size: 1000,
			steps: [1, 2, 5, 10, 30]
		},
		minute: {
			size: 60000,
			steps: [1, 2, 5, 10, 30]
		},
		hour: {
			size: 3600000,
			steps: [1, 2, 3, 6, 12]
		},
		day: {
			size: 86400000,
			steps: [1, 2, 5]
		},
		week: {
			size: 604800000,
			maxStep: 4
		},
		month: {
			size: 2.628e9,
			maxStep: 3
		},
		quarter: {
			size: 7.884e9,
			maxStep: 4
		},
		year: {
			size: 3.154e10,
			maxStep: false
		}
	};

	// Default config for a timeseries scale
	var defaultConfig = {
		position: 'bottom',

		time: {
			parser: false, // false == a pattern string from http://momentjs.com/docs/#/parsing/string-format/ or a custom callback that converts its argument to a moment
			format: false, // DEPRECATED false == date objects, moment object, callback or a pattern string from http://momentjs.com/docs/#/parsing/string-format/
			unit: false, // false == automatic or override with week, month, year, etc.
			round: false, // none, or override with week, month, year, etc.
			displayFormat: false, // DEPRECATED
			isoWeekday: false, // override week start day - see http://momentjs.com/docs/#/get-set/iso-weekday/
			minUnit: 'millisecond',

			// defaults to unit's corresponding unitFormat below or override using pattern string from http://momentjs.com/docs/#/displaying/format/
			displayFormats: {
				millisecond: 'h:mm:ss.SSS a', // 11:20:01.123 AM,
				second: 'h:mm:ss a', // 11:20:01 AM
				minute: 'h:mm:ss a', // 11:20:01 AM
				hour: 'MMM D, hA', // Sept 4, 5PM
				day: 'll', // Sep 4 2015
				week: 'll', // Week 46, or maybe "[W]WW - YYYY" ?
				month: 'MMM YYYY', // Sept 2015
				quarter: '[Q]Q - YYYY', // Q3
				year: 'YYYY' // 2015
			},
		},
		ticks: {
			autoSkip: false
		}
	};

	function parseTime(axis, label) {
		var timeOpts = axis.options.time;
		if (typeof timeOpts.parser === 'string') {
			return moment(label, timeOpts.parser);
		}
		if (typeof timeOpts.parser === 'function') {
			return timeOpts.parser(label);
		}
		if (typeof label.getMonth === 'function' || typeof label === 'number') {
			// Date objects
			return moment(label);
		}
		if (label.isValid && label.isValid()) {
			// Moment support
			return label;
		}
		var format = timeOpts.format;
		if (typeof format !== 'string' && format.call) {
			// Custom parsing (return an instance of moment)
			console.warn('options.time.format is deprecated and replaced by options.time.parser.');
			return format(label);
		}
		// Moment format parsing
		return moment(label, format);
	}

	/**
	 * Figure out which is the best unit for the scale
	 * @param minUnit {String} minimum unit to use
	 * @param min {Number} scale minimum
	 * @param max {Number} scale maximum
	 * @return {String} the unit to use
	 */
	function determineUnit(minUnit, min, max, maxTicks) {
		var units = Object.keys(interval);
		var unit;
		var numUnits = units.length;

		for (var i = units.indexOf(minUnit); i < numUnits; i++) {
			unit = units[i];
			var unitDetails = interval[unit];
			var steps = (unitDetails.steps && unitDetails.steps[unitDetails.steps.length - 1]) || unitDetails.maxStep;
			var range = max - min;
			var totalStepSize = steps * unitDetails.size;
            var numSteps = Math.ceil(range / totalStepSize);
			if (steps === undefined || numSteps <= maxTicks) {
				break;
			}
		}

		return unit;
	}

	/**
	 * Determines how we scale the unit
	 * @param min {Number} the scale minimum
	 * @param max {Number} the scale maximum
	 * @param unit {String} the unit determined by the {@see determineUnit} method
	 * @return {Number} the axis step size as a multiple of unit
	 */
	function determineStepSize(min, max, unit, maxTicks) {
		// Using our unit, figoure out what we need to scale as
		var unitDefinition = interval[unit];
		var unitSizeInMilliSeconds = unitDefinition.size;
		var sizeInUnits = Math.ceil((max - min) / unitSizeInMilliSeconds);
		var multiplier = 1;
		var range = max - min;

		if (unitDefinition.steps) {
			// Have an array of steps
			var numSteps = unitDefinition.steps.length;
			for (var i = 0; i < numSteps && sizeInUnits > maxTicks; i++) {
				multiplier = unitDefinition.steps[i];
				sizeInUnits = Math.ceil(range / (unitSizeInMilliSeconds * multiplier));
			}
		} else {
			while (sizeInUnits > maxTicks && maxTicks > 0) {
				++multiplier;
				sizeInUnits = Math.ceil(range / (unitSizeInMilliSeconds * multiplier));
			}
		}

		return multiplier;
	}

	/**
	 * Helper for generating axis labels.
	 * @param options {ITimeGeneratorOptions} the options for generation
	 * @param dataRange {IRange} the data range
	 * @param niceRange {IRange} the pretty range to display
	 * @return {Number[]} ticks
	 */
	function generateTicks(options, dataRange, niceRange) {
		var ticks = [];
		if (options.maxTicks) {
			var stepSize = options.stepSize;
			ticks.push(options.min !== undefined ? options.min : niceRange.min);
			var cur = moment(niceRange.min);
			while (cur.add(stepSize, options.unit).valueOf() < niceRange.max) {
				ticks.push(cur.valueOf());
			}
			var realMax = options.max || niceRange.max;
			if (ticks[ticks.length - 1] !== realMax) {
				ticks.push(realMax);
			}
		}
		return ticks;
	}

	/**
	 * @function Chart.Ticks.generators.time
	 * @param options {ITimeGeneratorOptions} the options for generation
	 * @param dataRange {IRange} the data range
	 * @return {Number[]} ticks
	 */
	Chart.Ticks.generators.time = function(options, dataRange) {
		var niceMin;
		var niceMax;
		var isoWeekday = options.isoWeekday;
		if (options.unit === 'week' && isoWeekday !== false) {
			niceMin = moment(dataRange.min).startOf('isoWeek').isoWeekday(isoWeekday).valueOf();
			niceMax = moment(dataRange.max).startOf('isoWeek').isoWeekday(isoWeekday);
			if (dataRange.max - niceMax > 0) {
				niceMax.add(1, 'week');
			}
			niceMax = niceMax.valueOf();
		} else {
			niceMin = moment(dataRange.min).startOf(options.unit).valueOf();
			niceMax = moment(dataRange.max).startOf(options.unit);
			if (dataRange.max - niceMax > 0) {
				niceMax.add(1, options.unit);
			}
			niceMax = niceMax.valueOf();
		}
		return generateTicks(options, dataRange, {
			min: niceMin,
			max: niceMax
		});
	};

	var DatasetScale = Chart.Scale.extend({
		/**
		* Internal function to get the correct labels. If data.xLabels or data.yLabels are defined, use those
		* else fall back to data.labels
		* @private
		*/
		getLabels: function() {
			var maxLength = 0;
			helpers.each(this.chart.data.datasets, function(dataset, datasetIndex) {
				if (maxLength === 0) {
					maxLength = dataset.data.length;
				} else if (dataset.data.length > maxLength) {
					maxLength = dataset.data.length;
				}
			});

			var labels = [];
			for (var i = 0; i < maxLength; i++) {
				var labelValue = parseTime(this, this.chart.data.datasets[0].data[i].t).format(this.options.time.format);
				labels.push(labelValue);
			}

			return labels;
		},

		determineDataLimits: function() {
			var me = this;

			var timeOpts = me.options.time;

			var labels = me.getLabels();
			me.minIndex = 0;
			me.maxIndex = labels.length - 1;
			var findIndex;

			if (me.options.ticks.min !== undefined) {
				// user specified min value
				findIndex = helpers.indexOf(labels, me.options.ticks.min);
				me.minIndex = findIndex !== -1 ? findIndex : me.minIndex;
			}

			if (me.options.ticks.max !== undefined) {
				// user specified max value
				findIndex = helpers.indexOf(labels, me.options.ticks.max);
				me.maxIndex = findIndex !== -1 ? findIndex : me.maxIndex;
			}

			me.min = moment(labels[me.minIndex]);
			me.max = moment(labels[me.maxIndex]);
		},

		buildTicks: function() {
			var me = this;
			var timeOpts = me.options.time;

			var labels = me.getLabels();
			// If we are viewing some subset of labels, slice the original array
			labels = (me.minIndex === 0 && me.maxIndex === labels.length - 1) ? labels : labels.slice(me.minIndex, me.maxIndex + 1);
//			var minTimestamp = labels[0];
//			var maxTimestamp = labels[labels.length - 1];

			var minTimestamp;
			var maxTimestamp;
//			var dataMin = me.dataMin;
//			var dataMax = me.dataMax;
			var dataMin = me.min;
			var dataMax = me.max;

			if (timeOpts.min) {
				var minMoment = parseTime(me, timeOpts.min);
				if (timeOpts.round) {
					minMoment.round(timeOpts.round);
				}
				minTimestamp = minMoment.valueOf();
			}

			if (timeOpts.max) {
				maxTimestamp = parseTime(me, timeOpts.max).valueOf();
			}

            var maxTicks = me.getLabelCapacity(minTimestamp || dataMin);
			var unit = timeOpts.unit || determineUnit(timeOpts.minUnit, minTimestamp || dataMin, maxTimestamp || dataMax, maxTicks);
			me.displayFormat = timeOpts.displayFormats[unit];

			var stepSize = timeOpts.stepSize || determineStepSize(minTimestamp || dataMin, maxTimestamp || dataMax, unit, maxTicks);
			var ticks = me.ticks = Chart.Ticks.generators.time({
				maxTicks: maxTicks,
				min: minTimestamp,
				max: maxTimestamp,
				stepSize: stepSize,
				unit: unit,
				isoWeekday: timeOpts.isoWeekday
			}, {
				min: dataMin,
				max: dataMax
			});

			// At this point, we need to update our max and min given the tick values since we have expanded the
			// range of the scale
			me.max = helpers.max(ticks);
			me.min = helpers.min(ticks);
		},

		getLabelForIndex: function(index, datasetIndex) {
			var me = this;
			var data = me.chart.data;
			var isHorizontal = me.isHorizontal();

			if (data.yLabels && !isHorizontal) {
				return me.getRightValue(data.datasets[datasetIndex].data[index]);
			}
			return me.ticks[index - me.minIndex];
		},

		// Function to format an individual tick mark
		tickFormatFunction: function(tick, index, ticks) {
			var formattedTick = tick.format(this.displayFormat);
			var tickOpts = this.options.ticks;
			var callback = helpers.getValueOrDefault(tickOpts.callback, tickOpts.userCallback);

			if (callback) {
				return callback(formattedTick, index, ticks);
			}
			return formattedTick;
		},
		convertTicksToLabels: function() {
			var me = this;
			me.ticksAsTimestamps = me.ticks;
			me.ticks = me.ticks.map(function(tick) {
				return moment(tick);
			}).map(me.tickFormatFunction, me);
		},
		getPixelForOffset: function(offset) {
			var me = this;
			var epochWidth = me.max - me.min;
			var decimal = epochWidth ? (offset - me.min) / epochWidth : 0;

			if (me.isHorizontal()) {
				var valueOffset = (me.width * decimal);
				return me.left + Math.round(valueOffset);
			}

			var heightOffset = (me.height * decimal);
			return me.top + Math.round(heightOffset);
		},
		// Used to get data value locations.  Value can either be an index or a numerical value
		getPixelForValue: function(value, index, datasetIndex, includeOffset) {
			var me = this;
			// 1 is added because we need the length but we have the indexes
			var offsetAmt = Math.max((me.maxIndex + 1 - me.minIndex - ((me.options.gridLines.offsetGridLines) ? 0 : 1)), 1);

			// If value is a data object, then index is the index in the data array,
			// not the index of the scale. We need to change that.
			var valueCategory;
			if (value !== undefined && value !== null) {
				valueCategory = me.isHorizontal() ? value.x : value.y;
			}
			if (valueCategory !== undefined || (value !== undefined && isNaN(index))) {
				var labels = me.getLabels();
				value = valueCategory || value;
				var idx = labels.indexOf(value);
				index = idx !== -1 ? idx : index;
			}

			if (me.isHorizontal()) {
				var valueWidth = me.width / offsetAmt;
				var widthOffset = (valueWidth * (index - me.minIndex));

				if (me.options.gridLines.offsetGridLines && includeOffset || me.maxIndex === me.minIndex && includeOffset) {
					widthOffset += (valueWidth / 2);
				}

				return me.left + Math.round(widthOffset);
			}
			var valueHeight = me.height / offsetAmt;
			var heightOffset = (valueHeight * (index - me.minIndex));

			if (me.options.gridLines.offsetGridLines && includeOffset) {
				heightOffset += (valueHeight / 2);
			}

			return me.top + Math.round(heightOffset);
		},
		getPixelForTick: function(index) {
			return this.getPixelForOffset(this.ticksAsTimestamps[index]);
		},
		getValueForPixel: function(pixel) {
			var me = this;
			var value;
			var offsetAmt = Math.max((me.ticks.length - ((me.options.gridLines.offsetGridLines) ? 0 : 1)), 1);
			var horz = me.isHorizontal();
			var valueDimension = (horz ? me.width : me.height) / offsetAmt;

			pixel -= horz ? me.left : me.top;

			if (me.options.gridLines.offsetGridLines) {
				pixel -= (valueDimension / 2);
			}

			if (pixel <= 0) {
				value = 0;
			} else {
				value = Math.round(pixel / valueDimension);
			}

			return value;
		},
		getBasePixel: function() {
			return this.bottom;
		},
		// Crude approximation of what the label width might be
		getLabelWidth: function(label) {
			var me = this;
			var ticks = me.options.ticks;

			var tickLabelWidth = me.ctx.measureText(label).width;
			var cosRotation = Math.cos(helpers.toRadians(ticks.maxRotation));
			var sinRotation = Math.sin(helpers.toRadians(ticks.maxRotation));
			var tickFontSize = helpers.getValueOrDefault(ticks.fontSize, Chart.defaults.global.defaultFontSize);
			return (tickLabelWidth * cosRotation) + (tickFontSize * sinRotation);
		},
		getLabelCapacity: function(exampleTime) {
			var me = this;

			me.displayFormat = me.options.time.displayFormats.millisecond;	// Pick the longest format for guestimation
			var exampleLabel = me.tickFormatFunction(moment(exampleTime), 0, []);
			var tickLabelWidth = me.getLabelWidth(exampleLabel);

			var innerWidth = me.isHorizontal() ? me.width : me.height;
			var labelCapacity = innerWidth / tickLabelWidth;
			return labelCapacity;
		}
	});

	Chart.scaleService.registerScaleType('timeseries', DatasetScale, defaultConfig);

};
