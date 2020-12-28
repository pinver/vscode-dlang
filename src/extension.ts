'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
//import * as rl from 'readline';
import * as net from 'net';
import * as vsc from 'vscode';
import * as lc from 'vscode-languageclient';
import * as util from './util';
import { promisify } from 'util';
import DubTaskProvider from './task-provider';

let socket: net.Socket;

var timer: any;
var button: any;
var lastVersion: any;
var maxStackSize = 999;

interface Versions {
    stack: number[],
    position: number
}
var versions: Versions = { stack: [], position: -1 };

var onIdleEnabled: boolean = false;

export async function activate(context: vsc.ExtensionContext) {
    vsc.window.showInformationMessage('Estension DLANG Personale 2');

    // ... on idle
    function hash( text: any )
    {
        var hash = 0;
        if( text.length === 0 )
        {
            return hash;
        }
        for( var i = 0; i < text.length; i++ )
        {
            var char = text.charCodeAt( i );
            hash = ( ( hash << 5 ) - hash ) + char;
            hash = hash & hash; // Convert to 32bit integer
        }

        return hash;
    }
    function doCommands()
    {
        /*
        // ... esegui i comandi nell'array json uno dopo l'altro
        function doNextCommand()
        {
            if( extensionConfig.commands.length > 0 )
            {
                var command = extensionConfig.commands.shift();
                vsc.commands.executeCommand( command ).then( doNextCommand );
            }
        }
        */

        timer = undefined;

        
        // ... cerca l'estensione del file attuale, 'D' per esempio
        let extension: string = getExtension();
        /*
        // ... cerca nella configurazione se c'e' un json per 'D'
        let extensionConfig = vsc.workspace.getConfiguration( 'onIdle' ).get( 'commands', {} )[ extension ];
        // ... esegui nel caso
        if( extensionConfig && extensionConfig.enabled === true )
        {
            doNextCommand();
        }
        */
       if( extension === "d" ){
           vsc.window.showInformationMessage('On Idle per il D');

           vsc.commands.executeCommand("workbench.action.tasks.runTask", "dmdsyntax" );
        }

    }
    // ... ritorna l'estensione del file corrente, 'D' per esempio
    function getExtension(): string
    {
        let editor = vsc.window.activeTextEditor;
        if( editor && editor.document )
        {
            let ext = path.extname( editor.document.fileName );
            if( ext && ext.length > 1 )
            {
                return ext.substr( 1 );
            }
        }
        return "";
    }
    // ... ritorna se l'estensione e' enabled per questo file nella configurazione
    function isEnabled(): boolean
    {
        let extension: string = getExtension();
        console.log(extension);
        /*
        var commands = vsc.workspace.getConfiguration( 'onIdle' ).get( 'commands', {} )[ extension ];
        return commands && commands.enabled;
        */
        return extension == "d" && onIdleEnabled;
    }

    function triggerCommands()
    {
        
        //var delay = parseInt( vsc.workspace.getConfiguration( 'onIdle' ).get( 'delay' ) );
        let delay: number = 2000;

        clearTimeout( timer );
        timer = undefined;

        if( isEnabled() && delay > 0 )
        {
            var editor = vsc.window.activeTextEditor;
            if( editor ){
                var version = editor.document.version;

                if( !lastVersion || version > lastVersion )
                {
                    timer = setTimeout( doCommands, delay );
                }
            }
        }
    }
    function updateButton()
    {
        var extension = getExtension();

        let enabled: boolean = isEnabled() === true;

        //let buttonIcon: string = vsc.workspace.getConfiguration( 'onIdle' ).get( 'buttonIcon' );
        let buttonIcon = "watch";

        button.text = "$(" + buttonIcon + ") $(" + ( enabled ? "check" : "x" ) + ")";
        button.command = 'onIdle.' + ( enabled ? 'disable' : 'enable' );
        button.tooltip = ( enabled ? 'Disable' : 'Enable' ) + " On Idle for ." + extension + " files";

        /*
        var extension = getExtension();
        var commands = vsc.workspace.getConfiguration( 'onIdle' ).get( 'commands', {} )[ extension ];

        if( commands && commands && commands.commands.length > 0 )
        {*/
            button.show();
        /*}
        else
        {
            button.hide();
        }*/
    }
    function createButton()
    {
        if( button )
        {
            button.dispose();
        }

        button = vsc.window.createStatusBarItem(
            /*vsc.workspace.getConfiguration( 'onIdle' ).get( 'buttonAlignment' ) + 1*/ 1,
            /*vsc.workspace.getConfiguration( 'onIdle' ).get( 'buttonPriority' )*/ 0);

        context.subscriptions.push( button );

        updateButton();
    }

    function configure( shouldEnable: boolean )
    {
        /*
        versions = { stack: [], position: -1 };
        var extension = getExtension();
        var commands = vsc.workspace.getConfiguration( 'onIdle' ).get( 'commands', {} );
        commands[ extension ].enabled = shouldEnable;
        vsc.workspace.getConfiguration( 'onIdle' ).update( 'commands', commands, true );
        */
       onIdleEnabled = shouldEnable; updateButton();
    }

    context.subscriptions.push( vsc.workspace.onDidChangeTextDocument( function( editor )
    {
        if( editor && editor.document )
        {
            var currentHash = hash( editor.document.getText() );

            if( versions.stack.length === 0 )
            {
                versions.stack.push( currentHash );
                versions.position = 0;
                triggerCommands();
            }
            else
            {
                var previous = versions.stack.indexOf( currentHash );
                if( previous > -1 )
                {
                    if( previous < versions.position )
                    {
                        versions.position = previous;
                    }
                    else if( previous > versions.position )
                    {
                        versions.position = previous;
                    }
                }
                else
                {
                    versions.stack.splice( versions.position + 1, versions.stack.length - versions.position );
                    versions.stack.push( currentHash );
                    versions.position = versions.stack.length - 1;

                    if( versions.stack.length > maxStackSize )
                    {
                        var previousLength = versions.stack.length;
                        versions.stack = versions.stack.splice( -maxStackSize );
                        versions.position -= ( previousLength - maxStackSize );
                    }

                    triggerCommands();
                }
            }
        }
    } ) );

    context.subscriptions.push( vsc.commands.registerCommand( 'onIdle.enable', function() { configure( true ); } ) );
    context.subscriptions.push( vsc.commands.registerCommand( 'onIdle.disable', function() { configure( false ); } ) );

    context.subscriptions.push( vsc.window.onDidChangeActiveTextEditor( function( e )
    {
        versions = { stack: [], position: -1 };
        clearTimeout( timer );
        timer = undefined;
        updateButton();
        if( e && e.document )
        {
            lastVersion = e.document.version - 1;
        }
    } ) );

    vsc.workspace.onDidOpenTextDocument( function()
    {
        versions = { stack: [], position: -1 };
        if( !button )
        {
            createButton();
        }
        else
        {
            clearTimeout( timer );
            timer = undefined;
            updateButton();
        }
    } );

    context.subscriptions.push( vsc.workspace.onDidChangeConfiguration( function( e )
    {
        /*
        if(
            e.affectsConfiguration( 'onIdle.delay' ) ||
            e.affectsConfiguration( 'onIdle.commands' ) )
        {
            triggerCommands();
            updateButton();
        }
        else if(
            e.affectsConfiguration( 'onIdle.buttonIcon' ) ||
            e.affectsConfiguration( 'onIdle.buttonAlignment' ) ||
            e.affectsConfiguration( 'onIdle.buttonPriority' ) )
        {
            createButton();
        }
        */
    } ) );


    // ... begin of vscode-dlang 


    vsc.workspace.registerTaskProvider('dub', new DubTaskProvider());
    let dlsPath = vsc.workspace.getConfiguration('d').get<string>('dlsPath') || await getDlsPath();

    if (dlsPath.length) {
        try {
            await promisify(fs.stat)(dlsPath);
            return launchServer(context, dlsPath);
        } catch (err) {
        }
    }

    return vsc.window.showErrorMessage('Problema lanciando dls, nel plugin originale, ora installerebbe DLS');
    /*
    dlsPath = '';
    let options: vsc.ProgressOptions = { location: vsc.ProgressLocation.Notification, title: 'Installing DLS' };

    if (!util.dub) {
        return vsc.window.showErrorMessage('Dub not found in PATH');
    }

    if (!util.compiler) {
        return vsc.window.showErrorMessage('No compiler found in PATH');
    }

    return vsc.window.withProgress(options, async progress => {
        await new Promise(resolve => cp.spawn(util.dub!, ['remove', '--version=*', 'dls']).on('exit', resolve));
        await new Promise(resolve => cp.spawn(util.dub!, ['fetch', 'dls']).on('exit', resolve));

        let args = ['run', '--compiler=' + util.compiler, '--quiet', 'dls:bootstrap', '--', '--progress'];
        let bootstrap = cp.spawn(util.dub!, args);
        let totalSize = 0;
        let currentSize = 0;
        let promise = new Promise(resolve => bootstrap.stdout
            .on('data', data => dlsPath += data.toString())
            .on('end', resolve));

        rl.createInterface(bootstrap.stderr)
            .on('line', (line: string) => {
                const size = Number(line);

                if (line === 'extract') {
                    progress.report({ message: 'Extracting' });
                } else if (totalSize === 0) {
                    totalSize = size;
                } else {
                    currentSize = size;
                    progress.report({
                        increment: 100 * (size - currentSize) / totalSize,
                        message: 'Downloading'
                    });
                }
            });

        await promise;
        return launchServer(context, dlsPath);
    });
    */
}

export function deactivate() {
    // .. on idle
    versions = { stack: [], position: -1 };
    clearTimeout( timer );
    timer = undefined;
}

async function getDlsPath() {
    let dlsExecutable = util.executableName('dls');
    let dlsDir = path.join(<string>process.env[util.isWindows ? 'LOCALAPPDATA' : 'HOME'],
        util.isWindows ? 'dub' : '.dub',
        'packages', '.bin');

    try {
        let dls = path.join(dlsDir, 'dls-latest', dlsExecutable);
        await promisify(fs.stat)(dls);
        return dls;
    } catch (err) {
        return path.join(dlsDir, dlsExecutable);
    }
}

function launchServer(context: vsc.ExtensionContext, dlsPath: string) {
    const serverOptions: lc.ServerOptions = vsc.workspace.getConfiguration('d').get('connectionType') === 'socket'
        ? () => createServerWithSocket(dlsPath).then<lc.StreamInfo>(() => ({ reader: socket, writer: socket }))
        : () => createServerWithStdio(dlsPath);
    const clientOptions: lc.LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'd' }],
        synchronize: { configurationSection: 'd.dls' },
        initializationOptions: vsc.workspace.getConfiguration('d').get('init')
    };
    const client = new lc.LanguageClient('d', 'DLS', serverOptions, clientOptions);
    client.onReady().then(() => {
        {
            let task: vsc.Progress<{ increment?: number, message?: string }>;
            let totalSize = 0;
            let currentSize = 0;
            let resolve: lc.GenericNotificationHandler;

            client.onNotification('$/dls/upgradeDls/didStart',
                (params: TranslationParams) => vsc.window.withProgress({
                    location: vsc.ProgressLocation.Notification,
                    title: params.tr
                }, t => new Promise(r => { task = t; resolve = r; })));
            client.onNotification('$/dls/upgradeDls/didStop', () => resolve());
            client.onNotification('$/dls/upgradeDls/didChangeTotalSize', (params: DlsUpgradeSizeParams) => totalSize = params.size);
            client.onNotification('$/dls/upgradeDls/didChangeCurrentSize', (params: DlsUpgradeSizeParams) => {
                task.report({
                    increment: 100 * (params.size - currentSize) / totalSize,
                    message: params.tr
                });
                currentSize = params.size;
            });
            client.onNotification('$/dls/upgradeDls/didExtract',
                (params: TranslationParams) => task.report({ message: params.tr }));
        }

        {
            let resolve: lc.GenericNotificationHandler;

            client.onNotification('$/dls/upgradeSelections/didStart',
                (params: TranslationParams) => vsc.window.withProgress({
                    location: vsc.ProgressLocation.Notification,
                    title: params.tr
                }, () => new Promise(r => resolve = r)));
            client.onNotification('$/dls/upgradeSelections/didStop', () => resolve());
        }
    });

    let startingItem: vsc.StatusBarItem;
    client.onDidChangeState(e => {
        if (e.newState == lc.State.Starting) {
            startingItem = vsc.window.createStatusBarItem(vsc.StatusBarAlignment.Left);
            startingItem.text = 'Starting DLS...'
            startingItem.show();
        }

        if (e.oldState == lc.State.Starting) {
            startingItem.dispose();
        }
    });

    context.subscriptions.push(client.start());
}

function createServerWithStdio(dlsPath: string) {
    return Promise.resolve(cp.spawn(dlsPath.trim(), ['--stdio']));
}

function createServerWithSocket(dlsPath: string) {
    let dls: cp.ChildProcess;
    return new Promise<cp.ChildProcess>(resolve => {
        let server = net.createServer(s => {
            socket = s;
            socket.setNoDelay(true);
            server.close();
            resolve(dls);
        });

        server.listen(0, '127.0.0.1', () => {
            dls = cp.spawn(dlsPath.trim(), ['--socket=' + (<net.AddressInfo>server.address()).port]);
        });
    });
}

interface TranslationParams {
    tr: string;
}

interface DlsUpgradeSizeParams extends TranslationParams {
    size: number;
}
