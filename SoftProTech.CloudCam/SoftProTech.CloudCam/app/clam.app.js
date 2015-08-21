// UTIL

///a helper method for adding leading zeroes
function zeroPad(num, places) {
    var zero = places - num.toString().length + 1;
    return Array(+(zero > 0 && zero)).join("0") + num;
}

// MODEL

//root navigation model
var NavigationModel = Backbone.Model.extend({
    defaults: {
        navigationLevel: "year",
        upPath: ""
    }
});

//model of a navigation item (year, month and so on)
var NavigationItemModel = Backbone.Model.extend({
    defaults: {
        navigationLevel: "year",
        path: "",
        displayName: ""
    }
});

//model of a collection of navigation items
var NavigationItemsCollection = Backbone.Collection.extend({
    model: NavigationItemModel
});

//model of a preview window
var PreviewModel = Backbone.Model.extend({
    defaults: {
        hour: "", //current frame hour,
        currentIdx: 0, //current frame index in frames collection
        currentPath: "", //current frame path (in storage)
        displayTime: "", //current frame timestamp (hh:mm:ss) - display only

        images: [], //collection of frames
    },

    initialize: function () {
    },

    //frames collection navigation functions:

    goFirst: function () {
        this.goToIndex(0);
    },

    goPrev: function () {
        this.goToIndex(this.get("currentIdx") - 1);
    },

    goNext: function () {
        this.goToIndex(this.get("currentIdx") + 1);
    },

    goLast: function () {
        this.goToIndex(this.get("images").length - 1);
    },

    goToIndex: function (idx) {
        var imgs = this.get("images");

        if (idx < 0)
            return;
        if (idx >= imgs.length)
            return;

        this.set("displayTime", this.get("hour") + ":" + zeroPad(imgs[idx].minute,2) + ":" + zeroPad(imgs[idx].second, 2));
        this.set("currentIdx", idx);
        this.set("currentPath", imgs[idx].path);
    }
});

// VIEW

//single navigation item view (camera, year, month, etc.)
var NavigationItemView = Marionette.ItemView.extend({
    tagName: "li",
    template: "#navigation-item-template"
});

//navigation composite view
var NavigationView = Marionette.CompositeView.extend({
    template: "#navigation-template",

    childView: NavigationItemView,
    childViewContainer: "#nav-items-region"
});

//browser / preview view
var RecordingBrowserView = Marionette.ItemView.extend({
    tagName: "form",
    template: "#recording-browser-template",

    //events published by UI elements
    events: {
        "click #first-frame-btn": "onFirstFrame",
        "click #prev-frame-btn": "onPrevFrame",
        "click #next-frame-btn": "onNextFrame",
        "click #last-frame-btn": "onLastFrame"
    },

    initialize: function (options) {
        this.model.on("change:currentPath", function () {
            //re-render when model changes
            this.render();
        }, this);
    },

    //events handled by view and dispatched to event bus:

    onFirstFrame: function (e) {
        app.vent.trigger("preview:onFirstFrame", this.model);
    },

    onPrevFrame: function (e) {
        app.vent.trigger("preview:onPrevFrame", this.model);
    },

    onNextFrame: function (e) {
        app.vent.trigger("preview:onNextFrame", this.model);
    },

    onLastFrame: function (e) {
        app.vent.trigger("preview:onLastFrame", this.model);
    }

});

// API

//api object - used to call backend proxy service (controller methods)
var browseApi = (function () {

    var browseApi = {};

    browseApi.initialize = function (app) {
    };

    browseApi.browseDirectories = function (path, callback) {

        $.ajax({
            method: "GET",
            url: "/Front/Browse",
            data: {
                path: path
            },
            cache: false,
            dataType: "json",
            success: function (data, status, xhr) {

                //get images and directories in one call and pass them to the callback method

                var dirs = $.grep(data, function (obj, i) {
                    return obj["content_type"] == "application/directory";
                });

                var images = $.grep(data, function (obj, i) {
                    return obj["content_type"] == "image/jpeg";
                });

                callback(dirs, images);
            }
        });
    };

    return browseApi;
})();

// CONTROLLER

var browseController = (function () {

    var application = null;
    var browseController = {};

    //handles camera picker (you can have more than one endpoint camera)
    browseController.browseCamera = function () {

        browseApi.browseDirectories(null, function (data) {
            var navView = browseController.getNavigationView(data, null, "camera", "Camera");
            application.leftRegion.show(navView);
            application.centerRegion.empty();
        });
    };

    //handles year picker
    browseController.browseYear = function (cam) {

        var path = cam;
        browseApi.browseDirectories(path, function (data) {
            var navView = browseController.getNavigationView(data, path, "year", "Year");
            application.leftRegion.show(navView);
            application.centerRegion.empty();
        });
    };

    //handles month picker
    browseController.browseMonth = function (cam, year) {
        var path = cam + "/" + year;
        browseApi.browseDirectories(path, function (data) {
            var navView = browseController.getNavigationView(data, path, "month", "Month");
            application.leftRegion.show(navView);
            application.centerRegion.empty();
        });
    };

    //handles day picker
    browseController.browseDay = function (cam, year, month) {
        var path = cam + "/" + year + "/" + month;
        browseApi.browseDirectories(path, function (data) {
            var navView = browseController.getNavigationView(data, path, "day", "Day");
            application.leftRegion.show(navView);
            application.centerRegion.empty();
        });
    };

    //handles hour picker
    browseController.browseHour = function (cam, year, month, day) {
        var path = cam + "/" + year + "/" + month + "/" + day;
        browseApi.browseDirectories(path, function (data) {
            var navView = browseController.getNavigationView(data, path, "hour", "Hour");

            application.leftRegion.show(navView);
            application.centerRegion.empty();
        });
    };

    //handles frames preview (and hour picker)
    browseController.preview = function (cam, year, month, day, hour) {

        var path = cam + "/" + year + "/" + month + "/" + day + "/" + hour;
        var path1 = cam + "/" + year + "/" + month + "/" + day;

        browseApi.browseDirectories(path1, function (data, images) {
            var navView = browseController.getNavigationView(data, path1, "hour", "Hour");
            application.leftRegion.show(navView);

            browseApi.browseDirectories(path, function (data, images) {
                var prevView = browseController.getPreviewView(hour, images, path);
                application.centerRegion.show(prevView);
            });

        });
    };

    //prepares preview view with model set up
    browseController.getPreviewView = function (hour, data, path) {

        var imgs = $.map(data, function (dto, idx) {

            var fileNameWithEx = dto.name.substr(dto.name.lastIndexOf("/") + 1);
            var fileName = fileNameWithEx.substr(0, fileNameWithEx.lastIndexOf("."));
            var minute = parseInt(fileName.substr(0, fileName.lastIndexOf("_")));
            var second = parseInt(fileName.substr(fileName.lastIndexOf("_") + 1));

            var totSeconds = minute * 60 + second;

            return {
                path: dto.name,
                minute: minute,
                second: second,
                totSeconds: totSeconds
            };
        });

        var imgsSorted = imgs.sort(function (a, b) { return (a.totSeconds < b.totSeconds) ? -1 : (a.totSeconds > b.totSeconds) ? 1 : 0; });

        $.each(imgsSorted, function (i, dto) {
            dto.idx = i;
        });

        var previewModel = new PreviewModel({
            hour: hour,
            images: imgsSorted
        });

        previewModel.goToIndex(0);

        var view = new RecordingBrowserView({ model: previewModel });
        return view;
    };

    //prepares navigation view with model set up
    browseController.getNavigationView = function (data, path, level, displayLevel) {

        var upPath = "";
        if (path != null)
            upPath = path.substr(0, path.lastIndexOf("/"));

        var cameraModels = $.map(data, function (dto, idx) {
            var lastLevel = dto.name.substr(dto.name.lastIndexOf("/") + 1);
            return new NavigationItemModel({
                navigationLevel: level,
                path: dto.name,
                displayName: displayLevel + " " + lastLevel
            });
        });

        var navigationModel = new NavigationModel({
            navigationLevel: level,
            upPath: upPath
        });

        var listModel = new NavigationItemsCollection(cameraModels);

        var navView = new NavigationView({ model: navigationModel, collection: listModel });

        return navView;
    };

    //handle messages published by the view and react accordingly
    browseController.initialize = function (appInst) {
        application = appInst;

        application.vent.on("preview:onFirstFrame", function (model) {
            model.goFirst();
        });

        application.vent.on("preview:onPrevFrame", function (model) {
            model.goPrev();
        });

        application.vent.on("preview:onNextFrame", function (model) {
            model.goNext();
        });

        application.vent.on("preview:onLastFrame", function (model) {
            model.goLast();
        });
    };

    return browseController;

})();

// ROUTER

//maps navigation routes and maps them to controller handler functions
var BrowseRouter = Marionette.AppRouter.extend({
    controller: browseController,
    appRoutes: {
        "": "browseCamera",
        "browseCamera": "browseCamera",
        "browseYear/:cam": "browseYear",
        "browseMonth/:cam/:year": "browseMonth",
        "browseDay/:cam/:year/:month": "browseDay",
        "browseHour/:cam/:year/:month/:day": "browseHour",
        "preview/:cam/:year/:month/:day/:hour": "preview"
    }
});

// APP
//application setup and initialization

var app = new Marionette.Application();
var browseRouter = new BrowseRouter();

app.addRegions({
    "leftRegion": "#left-region",
    "centerRegion": "#center-region"
});

app.on('start', function () {
    Backbone.history.start();
});

$(function () {
    browseController.initialize(app);
    browseApi.initialize(app);

    app.start();
});