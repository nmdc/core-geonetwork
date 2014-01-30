(function() {
  goog.provide('gn_onlinesrc_service');

  var module = angular.module('gn_onlinesrc_service', [
  ]);

  module.factory('gnOnlinesrc', [
    'gnBatchProcessing',
    'gnHttp',
    'gnEditor',
    'gnCurrentEdit',
    '$q',
    'Metadata',
    function(gnBatchProcessing, gnHttp, gnEditor, gnCurrentEdit, $q, Metadata) {

      var reload = false;
      var openCb = {};

      /**
       * To match an icon to a protocol
       */
      var protocolIcons = [
        ['OGC:', 'fa-globe'],
        ['ESRI', 'fa-globe'],
        ['WWW:LINK', 'fa-link'],
        ['DB:', 'fa-columns'],
        ['WWW:DOWNLOAD', 'fa-download']
      ];

      /**
     * Prepare batch process request parameters.
     *   - get parameters from onlinesrc form
     *   - add process name
     *   - encode URL
     *   - update name and desc if we add layers
     */
      var setParams = function(processName, formParams) {
        var params = angular.copy(formParams);
        angular.extend(params, {
          process: processName
        });
        //        if (!angular.isUndefined(params.url)) {
        //          params.url = encodeURIComponent(params.url);
        //        }
        return setLayersParams(params);
      };

      /**
      * Prepare name and description parameters
      * if we are adding resource with layers.
      *
      * Parse all selected layers, extract name
      * and title to build name and desc params like
      *   name : name1,name2,name3
      *   desc : title1,title2,title3
      */
      var setLayersParams = function(params) {
        if (angular.isArray(params.layers) &&
            params.layers.length > 0) {
          var names = [],
              descs = [];

          angular.forEach(params.layers, function(layer) {
            names.push(layer.name);
            descs.push(layer.title);
          });

          angular.extend(params, {
            name: names.join(','),
            desc: descs.join(',')
          });
        }
        delete params.layers;
        return params;
      };

      /**
       * Parse XML result of md.relations.get service.
       * Return an array of relations objects
       */
      var parseRelations = function(data) {

        var relations = {};
        if (!angular.isArray(data.relation)) {
          data.relation = [data.relation];
        }
        angular.forEach(data.relation, function(rel) {

          var type = rel['@type'];
          if (!relations[type]) {
            relations[type] = [];
          }
          rel.type = type;
          delete rel['@type'];

          if (rel['@subType']) {
            rel.subType = rel['@subType'];
            delete rel['@subType'];
          }
          if (angular.isString(rel.title) ||
              type == 'thumbnail') {
            relations[type].push(rel);
          }
        });
        return relations;
      };

      var refreshForm = function(scope, data) {
        gnEditor.refreshEditorForm(data);
        scope.reload = true;
      };

      var closePopup = function(id) {
        if (id) {
          $(id).modal('hide');
        }
      };

      /**
       * Run batch process, then refresh form with process
       * response and reload the updated online resources list.
       * The first save is done in 'runProcessMd'
       */
      var runProcess = function(scope, params) {
        return gnBatchProcessing.runProcessMd(params).then(function(data) {
          refreshForm(scope, $(data.data));
        });
      };

      /**
       * Run a service (not a batch) to add or remove
       * an onlinesrc.
       * Save the form, launch the service, then refresh
       * the form and reload the onlinesrc list.
       * The save is silent, in order not to reload the
       * onlinesrc list on save and on batch success.
       */
      var runService = function(service, params, scope) {
        gnEditor.save(false, true)
        .then(function() {
              gnHttp.callService(service, params).success(function() {
                refreshForm(scope);
              });
            });
      };

      /**
       * gnOnlinesrc service PUBLIC METHODS
       * - getAllResources
       * - addOnlinesrc
       * - linkToParent
       * - linkToDataset
       * - linkToService
       * - removeThumbnail
       * - removeOnlinesrc
       *******************************************
       */
      return {

        /**
         * This value is watched from gnOnlinesrcList directive
         * to reload online resources list when it is true
         */
        reload: reload,

        /**
         * Get all online resources for the current edited
         * metadata.
         */
        getAllResources: function() {

          var defer = $q.defer();

          gnHttp.callService('getRelations', {
            fast: false,
            id: gnCurrentEdit.id
          }, {
            method: 'post',
            headers: {
              'Content-type': 'application/xml'
            }
          }).success(function(data) {
            defer.resolve(parseRelations(data));
          });
          return defer.promise;
        },


        /**
         * Open onlinesrc popup and call registered
         * function (from the directive).
         */
        onOpenPopup: function(type) {
          openCb[type]();
        },

        /**
         * onlinesrc directive can register a function
         * on the open window event.
         */
        register: function(type, fn) {
          openCb[type] = fn;
        },

        /**
         * Prepare parameters and call batch
         * request from the gnBatchProcessing service
         */
        addOnlinesrc: function(params, popupid) {
          runProcess(this,
              setParams('onlinesrc-add', params)).then(function() {
            closePopup(popupid);
          });
        },

        /**
         *
         */
        addThumbnailByURL: function(params, popupid) {
          runProcess(this,
              setParams('thumbnail-add', params)).then(function() {
            closePopup(popupid);
          });
        },

        /**
         * Links to another metadata, could be
         * - parent
         * - source dataset
         * - feature catalog
         */
        linkToMd: function(mode, record, popupid) {
          var md = new Metadata(record);
          var params = {
            process: mode + '-add'
          };
          if (mode == 'fcats') {
            params.uuidref = md.getUuid();
          }
          else {
            params[mode + 'Uuid'] = md.getUuid();
          }
          runProcess(this, params).then(function() {
            closePopup(popupid);
          });
        },

        /**
         * Get display icon depending of the protocol
         * of the online resource.
         * To display onlinesrc list
         */
        getIconByProtocol: function(p) {
          for (i = 0; i < protocolIcons.length; ++i) {
            if (p.indexOf(protocolIcons[i][0]) >= 0) {
              return protocolIcons[i][1];
            }
          }
        },

        /**
         * Open onlinesrc url into a new window
         * On onlinesrc list click.
         */
        openLink: function(url) {
          window.open(url, '_blank');
        },

        /**
         * Link a service to the current metadata
         */
        linkToService: function(params, popupid) {
          var qParams = setParams('dataset-add', params);
          var scope = this;

          gnBatchProcessing.runProcessMdXml({
            scopedName: qParams.name,
            uuidref: qParams.uuidDS,
            uuid: qParams.uuidSrv,
            process: qParams.process
          }).then(function() {
            var qParams = setParams('service-add', params);
            runProcess(scope, {
              scopedName: qParams.name,
              uuidref: qParams.uuidSrv,
              uuid: qParams.uuidDS,
              process: qParams.process
            }).then(function() {
              closePopup(popupid);
            });
          });
        },

        /**
         * Call md.processing. in mode 'parent-add'
         * to link a service to the edited metadata
         */
        linkToDataset: function(params, popupid) {
          var qParams = setParams('onlinesrc-add', params);
          var scope = this;

          gnBatchProcessing.runProcessMdXml({
            scopedName: qParams.name,
            uuidref: qParams.uuidSrv,
            uuid: qParams.uuidDS,
            process: qParams.process
          }).then(function() {
            var qParams = setParams('dataset-add', params);

            runProcess(scope, {
              scopedName: qParams.name,
              uuidref: qParams.uuidDS,
              uuid: qParams.uuidSrv,
              process: qParams.process
            }).then(function() {
              closePopup(popupid);
            });
          });
        },

        /**
         * Run a the process sibling with given parameters
         */
        linkToSibling: function(params, popupid) {
          runProcess(this,
              setParams('sibling-add', params)).then(function() {
            closePopup(popupid);
          });
        },

        /**
         * Remove a thumbnail from metadata.
         * Type large or small is specified in parameter.
         * The onlinesrc panel is reloaded after removal.
         */
        removeThumbnail: function(thumb) {
          var scope = this;

          // It is a url thumbnail
          if (thumb.id.indexOf('resources.get') < 0) {
            runProcess(this,
                setParams('thumbnail-remove', {
                  id: gnCurrentEdit.id,
                  thumbnail_url: thumb.id
                }));
          }
          // It is an uploaded tumbnail
          else {
            runService('removeThumbnail', {
              type: (thumb.title === 'thumbnail' ? 'small' : 'large'),
              id: gnCurrentEdit.id,
              version: gnCurrentEdit.version
            }, this);
          }
        },

        removeOnlinesrc: function(onlinesrc) {
          var scope = this;

          if (onlinesrc.protocol == 'WWW:DOWNLOAD-1.0-http--download') {
            runService('removeOnlinesrc', {
              id: gnCurrentEdit.id,
              url: onlinesrc.url,
              name: onlinesrc.name
            }, this);
          } else {
            runProcess(this,
                setParams('onlinesrc-remove', {
                  id: gnCurrentEdit.id,
                  url: onlinesrc.url,
                  name: onlinesrc.name
                }));
          }
        },

        /**
         * Remove a service from a metadata
         */
        removeService: function(onlinesrc) {
          var params = {
            uuid: onlinesrc['geonet:info'].uuid,
            uuidref: gnCurrentEdit.uuid
          };
          runProcess(this,
              setParams('services-remove', params));
        },

        /**
         * Remove a dataset from a metadata of
         * service
         */
        removeDataset: function(onlinesrc) {
          var params = {
            uuid: gnCurrentEdit.uuid,
            uuidref: onlinesrc['geonet:info'].uuid
          };
          runProcess(this,
              setParams('datasets-remove', params));
        },

        /**
         * Remove a link metadata by calling a process.
         * The mode can be 'source', 'parent'
         */
        removeMdLink: function(mode, onlinesrc) {
          var params = {};
          params[mode + 'Uuid'] = onlinesrc['geonet:info'].uuid;
          runProcess(this,
              setParams(mode + '-remove', params));
        },

        /**
         * Remove a feature catalog link from the
         * current metadata.
         */
        removeFeatureCatalog: function(onlinesrc) {
          var params = {
            uuid: gnCurrentEdit.uuid,
            uuidref: onlinesrc.uuid
          };
          runProcess(this,
              setParams('fcats-remove', params));
        },

        /**
         * Remove a sibling link from the
         * current metadata.
         */
        removeSibling: function(onlinesrc) {
          var params = {
            uuid: gnCurrentEdit.uuid,
            uuidref: onlinesrc.uuid
          };
          runProcess(this,
              setParams('sibling-remove', params));
        },

        /**
         * Specific method used by the geopublisher.
         * Compute online resource XML for the given protocols.
         *
         * return the XML snippet to include to the form.
         */
        addFromGeoPublisher: function(layerName, node, protocols) {

          var xml = '';
          layerName =
              (node.id.indexOf('mapserver') === -1 ?
                  node.namespacePrefix + ':' : '') + layerName;

          for (var p in protocols) {
            if (protocols.hasOwnProperty(p) && protocols[p].checked === true) {
              xml +=
                  '<gmd:onLine xmlns:gmd="http://www.isotc211.org/2005/gmd" ' +
                  '            xmlns:gco="http://www.isotc211.org/2005/gco">' +
                  '  <gmd:CI_OnlineResource>' +
                  '    <gmd:linkage><gmd:URL>' + node[p + 'Url'] +
                  '    </gmd:URL></gmd:linkage>' +
                  '    <gmd:protocol><gco:CharacterString>' +
                  protocols[p].label +
                  '    </gco:CharacterString></gmd:protocol>' +
                  '    <gmd:name><gco:CharacterString>' +
                  layerName +
                  '    </gco:CharacterString></gmd:name>' +
                  // TODO : define default description
                  '    <gmd:description><gco:CharacterString>' +
                  '    </gco:CharacterString></gmd:description>' +
                  '  </gmd:CI_OnlineResource>' +
                  '</gmd:onLine>';
              + '&&&';
            }
          }
          return xml;
        }
      };
    }]);
})();