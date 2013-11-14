/*global console define*/
/*jslint browser:true sub:true*/
define(['orion/Deferred', 'orion/objects', 'orion/commands', 'orion/outliner', 'orion/webui/littlelib',
		'orion/URITemplate',
		'orion/PageUtil',
		'orion/widgets/nav/mini-nav',
		'orion/widgets/nav/project-nav',
		'i18n!orion/edit/nls/messages'],
		function(Deferred, objects, mCommands, mOutliner, lib, URITemplate, PageUtil, MiniNavViewMode, ProjectNavViewMode, messages) {

	/**
	 * @name orion.sidebar.Sidebar
	 * @class Sidebar that appears alongside an {@link orion.editor.Editor} in the Orion IDE.
	 * @param {Object} params
	 * @param {orion.commandregistry.CommandRegistry} params.commandRegistry
	 * @param {orion.core.ContentTypeRegistry} params.contentTypeRegistry
	 * @param {orion.fileClient.FileClient} params.fileClient
	 * @param {orion.editor.InputManager} params.editorInputManager
	 * @param {orion.outliner.OutlineService} params.outlineService
	 * @param {orion.progress.ProgressService} params.progressService
	 * @param {orion.selection.Selection} params.selection
	 * @param {orion.serviceregistry.ServiceRegistry} params.serviceRegistry
	 * @param {Object} [params.sidebarNavInputManager]
	 * @param {Element|String} params.parent
	 * @param {Element|String} params.toolbar
	 */
	function Sidebar(params) {
		this.params = params;
		this.commandRegistry = params.commandRegistry;
		this.contentTypeRegistry = params.contentTypeRegistry;
		this.fileClient = params.fileClient;
		this.editorInputManager = params.editorInputManager;
		this.outlineService = params.outlineService;
		this.parentNode = lib.node(params.parent);
		this.toolbarNode = lib.node(params.toolbar);
		this.selection = params.selection;
		this.serviceRegistry = params.serviceRegistry;
		this.sidebarNavInputManager = params.sidebarNavInputManager;
		this.viewModes = {};
		this.activeViewMode = null;
		this.modeContributionToolbar = null;
		this.switcherNode = null;
	}
	objects.mixin(Sidebar.prototype, /** @lends orion.sidebar.Sidebar.prototype */ {
		/**
		 * @name orion.sidebar.Sidebar#defaultViewMode
		 * @type String
		 */
		defaultViewMode: "nav", //$NON-NLS-0$
		show: function() {
			if (this.created) {
				return;
			}
			this.created = true;
			var commandRegistry = this.commandRegistry;
			var contentTypeRegistry = this.contentTypeRegistry;
			var fileClient = this.fileClient;
			var editorInputManager = this.editorInputManager;
			var outlineService = this.outlineService;
			var parentNode = this.parentNode;
			var progressService = this.progressService;
			var selection = this.selection;
			var serviceRegistry = this.serviceRegistry;
			var toolbarNode = this.toolbarNode;

			// Create toolbar contribution area for use by viewmodes
			var modeContributionToolbar = this.modeContributionToolbar = document.createElement("div"); //$NON-NLS-0$
			modeContributionToolbar.id = toolbarNode.id + "childModes"; //$NON-NLS-0$
			toolbarNode.appendChild(modeContributionToolbar);
			var switcherNode = this.switcherNode = document.createElement("ul"); //$NON-NLS-0$
			switcherNode.id = toolbarNode.id + "viewmodeSwitch"; //$NON-NLS-0$
			switcherNode.classList.add("layoutRight"); //$NON-NLS-0$
			switcherNode.classList.add("commandList"); //$NON-NLS-0$
			switcherNode.classList.add("pageActions"); //$NON-NLS-0$
			toolbarNode.appendChild(switcherNode);

			var changeViewModeCommand = new mCommands.Command({
				name: messages["View"],
				imageClass: "core-sprite-outline", //$NON-NLS-0$
				selectionClass: "dropdownSelection", //$NON-NLS-0$
				tooltip: messages["ViewTooltip"],
				id: "orion.sidebar.viewmode", //$NON-NLS-0$
				visibleWhen: function(item) {
					return true;
				},
				choiceCallback: this.viewModeMenuCallback.bind(this)
			});
			commandRegistry.addCommand(changeViewModeCommand);
			commandRegistry.registerCommandContribution(switcherNode.id, "orion.sidebar.viewmode", 1); //$NON-NLS-0$

			this.addViewMode("nav", new MiniNavViewMode({ //$NON-NLS-0$
				commandRegistry: commandRegistry,
				contentTypeRegistry: contentTypeRegistry,
				fileClient: fileClient,
				editorInputManager: editorInputManager,
				parentNode: parentNode,
				sidebarNavInputManager: this.sidebarNavInputManager,
				serviceRegistry: serviceRegistry,
				toolbarNode: modeContributionToolbar
			}));
			
			if(this.serviceRegistry.getServiceReferences("orion.projects").length>0){ //$NON-NLS-0$
				var _self = this;
				var uriTemplate = new URITemplate("#{,resource,params*}"); //$NON-NLS-0$
				var scopeUp = function() {
					var input = PageUtil.matchResourceParameters();
					var resource = input.resource;
					delete input.navigate;
					delete input.resource;
					window.location.href = uriTemplate.expand({resource: resource, params: input});
					_self.setViewMode("nav"); //$NON-NLS-0$
				};
				var id = "project"; //$NON-NLS-0$
				var projectViewMode = new ProjectNavViewMode({ //$NON-NLS-0$
					commandRegistry: commandRegistry,
					contentTypeRegistry: contentTypeRegistry,
					fileClient: fileClient,
					editorInputManager: editorInputManager,
					parentNode: parentNode,
					sidebarNavInputManager: this.sidebarNavInputManager,
					serviceRegistry: serviceRegistry,
					toolbarNode: modeContributionToolbar,
					scopeUp: scopeUp
				});
				var getProjectJson = function(metadata) {
					function getJson(children) {
						for(var i=0; i<children.length; i++){
							if(!children[i].Directory && children[i].Name === "project.json"){ //$NON-NLS-0$
								return children[i];
							}
						}
						return null;
					}
					var deferred = new Deferred();
					if (metadata.Children){
						deferred.resolve(getJson(metadata.Children));
					} else if(metadata.ChildrenLocation){
						_self.fileClient.fetchChildren(metadata.ChildrenLocation).then(function(children){
							deferred.resolve(getJson(children));
						});
					}
					return deferred;
				};
				var showMode = function(show) {
					var showing = !!_self.getViewMode(id);
					if (showing === show) { return; }
					if (show) {
						_self.addViewMode(id, projectViewMode);
						_self.renderViewModeMenu();
					} else {
						_self.removeViewMode(id);
						_self.renderViewModeMenu();
					}
				};
				// Switch to project view mode if a project is opened
				this.editorInputManager.addEventListener("InputChanged", function(event){ //$NON-NLS-0$
					if(event.metadata && event.metadata.Directory){
						if(!event.metadata.Parents) {
							if (_self.getActiveViewModeId() === id) {
								scopeUp();
							}
						} else {
							getProjectJson(event.metadata).then(function(json) {
								if (json) {
									showMode(true);
									_self.setViewMode(id);
								}
							});
						}
					}
				});
				// Only show project view mode if selection is in a project
				this.sidebarNavInputManager.addEventListener("selectionChanged", function(event){ //$NON-NLS-0$
					if (_self.getActiveViewModeId() === id) { return; }
					var item = event.selections && event.selections.length > 0 ? event.selections[0] : null;
					if (item) {
						while (item.parent && item.parent.parent) {
							item = item.parent;
						}
						getProjectJson(item).then(function(json) {
							showMode(!!json);
						});
					} else {
						showMode(false);
					}
				});
			}

			// Outliner is responsible for adding its view mode(s) to this sidebar
			this.outliner = new mOutliner.Outliner({
				parent: parentNode,
				toolbar: modeContributionToolbar,
				serviceRegistry: serviceRegistry,
				contentTypeRegistry: contentTypeRegistry,
				outlineService: outlineService,
				commandService: commandRegistry,
				selectionService: selection,
				inputManager: editorInputManager,
				progressService: progressService,
				sidebar: this
			});
			this.setViewMode(this.defaultViewMode);
		},
		/** @private */
		viewModeMenuCallback: function() {
			var _self = this;
			return Object.keys(this.viewModes).map(function(modeId) {
				var mode = _self.getViewMode(modeId);
				return {
					name: mode.label || modeId,
					callback: _self.setViewMode.bind(_self, modeId)
				};
			});
		},
		getActiveViewModeId: function() {
			return this.activeViewModeId;
		},
		/**
		 * @param {String} id
		 * @param {orion.sidebar.ViewMode} mode
		 */
		addViewMode: function(id, mode) {
			if (!id) {
				throw new Error("Invalid id: " + id); //$NON-NLS-0$
			}
			if (!mode || typeof mode !== "object") { //$NON-NLS-0$
				throw new Error("Invalid mode: "  + mode); //$NON-NLS-0$
			}
			if (!Object.prototype.hasOwnProperty.call(this.viewModes, id)) {
				this.viewModes[id] = mode;
			}
		},
		/**
		 * @param {String} id
		 */
		removeViewMode: function(id) {
			var mode = this.getViewMode(id);
			if (mode && typeof mode.destroy === "function") { //$NON-NLS-0$
				mode.destroy();
			}
			delete this.viewModes[id];
		},
		/**
		 * @param {String} id
		 */
		getViewMode: function(id) {
			if (Object.prototype.hasOwnProperty.call(this.viewModes, id)) {
				return this.viewModes[id];
			}
			return null;
		},
		/**
		 * @param {String} id
		 */
		setViewMode: function(id) {
			var mode = this.activeViewMode;
			if (mode && typeof mode.destroy === "function") { //$NON-NLS-0$
				mode.destroy();
			}
			// clean out any toolbar contributions
			this.commandRegistry.destroy(this.modeContributionToolbar);
			lib.empty(this.parentNode);
			mode = this.activeViewMode = this.getViewMode(id);
			this.activeViewModeId = mode ? id : null;
			if (mode && typeof mode.create === "function") { //$NON-NLS-0$
				mode.create();
			}
		},
		renderViewModeMenu: function() {
			var switcher = this.switcherNode;
			this.commandRegistry.destroy(switcher);
			var modes = Object.keys(this.viewModes);
			if (modes.length > 1) {
				this.commandRegistry.renderCommands(switcher.id, switcher, {}, this, "button"); //$NON-NLS-0$
			}
		}
	});

	/**
	 * @name orion.sidebar.ViewMode
	 * @class Interface for a view mode that can provide content to a {@link orion.sidebar.Sidebar}.
	 */
	/**
	 * @name orion.sidebar.ViewMode#create
	 * @function
	 */
	/**
	 * @name orion.sidebar.ViewMode#destroy
	 * @function
	 */
	/**
	 * @name orion.sidebar.ViewMode#label
	 * @type String
	 */
	return Sidebar;
});
