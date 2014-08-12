define( function( require, exports, module ) {
	'use strict';

    var Config = {
        'ns' : 'lamo2k123.brackets-sftpu'
    };

    var PreferencesManager  = brackets.getModule('preferences/PreferencesManager'),
		PanelManager        = brackets.getModule('view/PanelManager'),
		Resizer             = brackets.getModule('utils/Resizer'),
        Preferences         = PreferencesManager.getExtensionPrefs(Config.ns);

    Preferences.definePreference('active', 'boolean', false);

	// Get dependencies.
	var Async = brackets.getModule( 'utils/Async' ),
		Menus = brackets.getModule( 'command/Menus' ),
		CommandManager = brackets.getModule( 'command/CommandManager' ),
		Commands = brackets.getModule( 'command/Commands' ),
//		PreferencesManager = brackets.getModule('preferences/PreferencesManager'),
		ProjectManager = brackets.getModule( 'project/ProjectManager' ),
		EditorManager = brackets.getModule( 'editor/EditorManager' ),
		DocumentManager = brackets.getModule( 'document/DocumentManager' ),
		AppInit = brackets.getModule( 'utils/AppInit' ),
		FileUtils = brackets.getModule( 'file/FileUtils' ),
		FileSystem = brackets.getModule( 'filesystem/FileSystem' ),
		ExtensionUtils = brackets.getModule( 'utils/ExtensionUtils' ),
        NodeDomain = brackets.getModule("utils/NodeDomain"),

		// Extension basics.
		COMMAND_ID = 'bigeyex.bracketsSFTPUpload.enable',
        COMMAND_ID_UPLOAD = 'bigeyex.bracketsSFTPUpload.upload',

		Strings = require( 'modules/Strings' ),
        dataStorage = require( 'modules/DataStorageManager' ),
        settingsDialog = require( 'modules/SettingsDialog' ),

		// Preferences.
//		preferences = PreferencesManager.getExtensionPrefs( 'bigeyex.bracketsSFTPUpload' ),

		// Mustache templates.
//		todoPanelTemplate = require( 'text!html/panel.html' ),
		todoRowTemplate = require( 'text!html/row.html' ),

		// Setup extension.
        serverInfo, //sftp username/password etc;
		$todoPanel,
        projectUrl,

		// Get view menu.
		menu = Menus.getMenu( Menus.AppMenuBar.VIEW_MENU ),
        contextMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);


	// Define preferences.
//	preferences.definePreference( 'enabled', 'boolean', false );

    // Get Node module domain
    var _domainPath = ExtensionUtils.getModulePath(module, "node/SftpUploadDomain");
    var _nodeDomain = new NodeDomain("sftpUpload", _domainPath);

	// Register extension.

    CommandManager.register( Strings.EXTENSION_NAME, COMMAND_ID, togglePanel );
	CommandManager.register( Strings.UPLOAD_MENU_NAME, COMMAND_ID_UPLOAD, uploadMenuAction );


	// Add command to menu.
	if ( menu !== undefined ) {
		menu.addMenuDivider();
		menu.addMenuItem( COMMAND_ID, 'Ctrl-Alt-U' );
	}

    if ( contextMenu !== undefined ) {
        contextMenu.addMenuDivider();
        contextMenu.addMenuItem( COMMAND_ID_UPLOAD );
    }

	// Load stylesheet.
	ExtensionUtils.loadStyleSheet( module, 'todo.css' );

	/**
	 * Set state of extension.
	 */
    // this is a menu item
	function togglePanel() {
		var enabled = Preferences.get('active');

		enablePanel( !enabled );
	}

    function uploadMenuAction(){
        var item = ProjectManager.getSelectedItem();
        var projectUrl = ProjectManager.getProjectRoot().fullPath;
        var remotePath = item.fullPath.replace(projectUrl, '');
        if(item.isFile){
            uploadItem(item.fullPath, remotePath);
        }
        else{
            uploadDirectory(item.fullPath, remotePath);
        }
    }

	/**
	 * Initialize extension.
	 */
	function enablePanel( enabled ) {
		if ( enabled ) {
			loadSettings( function() {
				// Show panel.
				Resizer.show( $todoPanel );
			} );

//            elButtom.classList.add('brackets-sftpu_active');
		} else {
			// Hide panel.
			Resizer.hide( $todoPanel );

//            elButtom.classList.remove('brackets-sftpu_active');
		}

		// Save enabled state.
//		preferences.set('active', enabled);
//		preferences.save();

		// Mark menu item as enabled/disabled.
		CommandManager.get( COMMAND_ID ).setChecked( enabled );
	}

	// this is called every time the panel opens.
	function loadSettings( callback ) {
        var changedFiles = dataStorage.get('changed_files');
        var files = [];
        var projectUrl = ProjectManager.getProjectRoot().fullPath;
        for(var filepath in changedFiles){
            files.push({
                path: filepath,
                file: filepath.replace(projectUrl, '')
            });
        }

        $('#sftp-upload-tbody').empty().append(Mustache.render( todoRowTemplate, {
				strings: Strings,
                files: files
        } ));

        $('#sftp-upload-tbody tr').off().on('click', function(){
            var fullPath = $(this).attr('x-file');
            CommandManager.execute( Commands.FILE_OPEN, { fullPath: fullPath } );
        });

        $('#sftp-upload-tbody .upload-button').off().on('click', function(e){
            uploadItem($(this).attr('x-file'), $(this).attr('r-file'));
            e.stopPropagation();
        });

        $('#sftp-upload-tbody .skip-button').off().on('click', function(e){
            skipItem($(this).attr('x-file'));
            e.stopPropagation();
        });

        if ( callback ) { callback(); }
	}

    // upload ONE file to the server
    function uploadItem(localPath, remotePath){
        var serverInfo = dataStorage.get('server_info');
        _nodeDomain.exec('upload', localPath, remotePath, serverInfo).fail(function(err){
            updateStatus(err);
        });;
    }

    function uploadDirectory(localPath, remotePath){
        var serverInfo = dataStorage.get('server_info');
        _nodeDomain.exec('uploadDirectory', localPath, remotePath, serverInfo).fail(function(err){
            updateStatus(err);
        });;
    }

    // upload all files in the panel to the server
    function uploadAllItems(){
        var serverInfo = dataStorage.get('server_info');
        var trs = $('#brackets-sftp-upload tr .upload-button');
        var filelist = [];
        for(var i=0;i<trs.length;i++){
            var arg = {
                localPath: $(trs[i]).attr('x-file'),
                remotePath: $(trs[i]).attr('r-file')
            };
            filelist.push(arg);
        }
        _nodeDomain.exec('uploadAll', filelist, serverInfo).fail(function(err){
            updateStatus(err);
        });
    }

    function skipItem(path) {
        var changedFiles = dataStorage.get('changed_files');
        $('#brackets-sftp-upload tr[x-file="'+path+'"]').remove();
        if(path in changedFiles){
            delete changedFiles[path];
            dataStorage.set('changed_files', changedFiles);
        }
    }

    function skipAllItems(){
        $('#brackets-sftp-upload tr').remove();
        dataStorage.set('changed_files', {});
    }

    function updateStatus(status){
        $('#brackets-sftp-upload .status-stab').text(status);
    }

	/**
	 * Listen for save or refresh and look for todos when needed.
	 */
	function registerListeners() {
		var $documentManager = $( DocumentManager ),
			$projectManager = $( ProjectManager );

		// Listeners bound to Brackets modules.
		$documentManager
			.on( 'documentSaved.todo', function( event, document ) {
				//TODO: add current document to change list
                var path = document.file.fullPath;
                var changedFiles = dataStorage.get('changed_files');
                if(changedFiles === null){
                    changedFiles = {};
                }
                var projectUrl = ProjectManager.getProjectRoot().fullPath;
                var serverInfo = dataStorage.get('server_info');
                if(serverInfo.uploadOnSave){
                    uploadItem(path, path.replace(projectUrl, ''));
                    return;
                }
                if(!(path in changedFiles)){
                    changedFiles[path]=1;
                    dataStorage.set('changed_files', changedFiles);
                    $('#sftp-upload-tbody').append(Mustache.render( todoRowTemplate, {
                            strings: Strings,
                            files: [{
                                path: path,
                                file: path.replace(projectUrl, '')
                            }]
                    }));

                    $('#sftp-upload-tbody .upload-button').off().on('click', function(e){
                        uploadItem($(this).attr('x-file'), $(this).attr('r-file'));
                        e.stopPropagation();
                    });

                    $('#sftp-upload-tbody .skip-button').off().on('click', function(e){
                        skipItem($(this).attr('x-file'));
                        e.stopPropagation();
                    });
                }

			} );

	}

    var SFTPU = function() {

        console.log('HERE', Preferences.get('active'));
        this
            .addButton()
            .addPanel();
    };

    SFTPU.prototype.createButton = function() {
        var elButtom = document.createElement('a');
        elButtom.id = 'brackets-sftpu';

        Preferences.get('active') && elButtom.classList.add('brackets-sftpu_active');

        elButtom.addEventListener('click', this.eventsButton.bind(this));

        return elButtom;
    };

    SFTPU.prototype.eventsButton = function(e) {
        e && e.preventDefault();

        document.getElementById('brackets-sftpu').classList.toggle('brackets-sftpu_active');
        Resizer.toggle(document.getElementById('brackets-sftpu-panel'));

        Preferences.set('active', !Preferences.get('active'));

        CommandManager.execute(COMMAND_ID);
    };

    SFTPU.prototype.addButton = function() {
        var MainToolbar = document.getElementById('main-toolbar'),
            Buttons     = MainToolbar.getElementsByClassName('buttons');

        for(var i = 0; i < Buttons.length; i++) {
            Buttons[i].appendChild(this.createButton());
        }

        return this;
    };

    SFTPU.prototype.addPanel = function() {
		var $panel = $(Mustache.render(require('text!templates/panel.html'), {
            i18n : Strings
        }));

        $panel.on('click', '.brackets-sftpu__closed', this.eventsButton.bind(this));

        PanelManager.createBottomPanel(Config.ns, $panel, 200);
        Preferences.get('active') && Resizer.show($panel);

    };

	// Register panel and setup event listeners.
	AppInit.appReady( function() {
/*
		var panelHTML = Mustache.render( todoPanelTemplate, {
				strings: Strings
			} );*/

		// Create and cache todo panel.
//		PanelManager.createBottomPanel(Config.ns, $( panelHTML ), 100 );
//		$todoPanel = $( '#brackets-sftp-upload' );

		// Close panel when close button is clicked.
		/*$todoPanel
			.on( 'click', '.close', function() {
				enablePanel( false );
			} );
*/
		// Setup listeners.
		registerListeners();

        var app = new SFTPU();
        // here

        $todoPanel.on('click', '.btn-server-setup',function(){
            settingsDialog.showDialog();
        });

        $todoPanel.on('click', '.btn-upload-all',function(){
            uploadAllItems();
        });

        $todoPanel.on('click', '.btn-skip-all',function(){
            skipAllItems();
        });


        $(_nodeDomain).on('uploading', function(err, msg){
            updateStatus('Uploading: '+msg);
        });
        $(_nodeDomain).on('uploaded', function(err, msg){
            var projectUrl = ProjectManager.getProjectRoot().fullPath;
            skipItem(projectUrl+msg);
            updateStatus('Finished: '+msg);
        });
        $(_nodeDomain).on('error', function(err, msg){
            updateStatus('Error: '+msg);
        });
	} );
} );
