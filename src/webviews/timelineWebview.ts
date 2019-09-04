'use strict';
import { commands, Disposable, TextEditor, ViewColumn, window } from 'vscode';
import { Commands, DiffWithPreviousCommandArgs } from '../commands';
import { WebviewBase } from './webviewBase';
import { Container } from '../container';
import { GitUri } from '../git/gitService';
import {
	IpcMessage,
	onIpcCommand,
	ReadyCommandType,
	TimelineClickCommandType,
	TimelineData,
	TimelineDidChangeDataNotificationType
} from './protocol';
import { debug, Functions } from '../system';
import { isTextEditor } from '../constants';

export class TimelineWebview extends WebviewBase {
	private _editor: TextEditor | undefined;

	constructor() {
		super(Commands.ShowTimelinePage, ViewColumn.Beside);

		const editor = window.activeTextEditor;
		if (editor !== undefined && isTextEditor(editor)) {
			this._editor = editor;
		}

		this._disposable = Disposable.from(
			this._disposable,
			window.onDidChangeActiveTextEditor(Functions.debounce(this.onActiveEditorChanged, 500), this)
		);
	}

	@debug({ args: false })
	private onActiveEditorChanged(editor: TextEditor | undefined) {
		if (editor === undefined && window.visibleTextEditors.length !== 0) return;
		if (editor !== undefined && !isTextEditor(editor)) return;

		this._editor = editor;
		this.notifyDidChangeData(editor);
	}

	protected onMessageReceived(e: IpcMessage) {
		switch (e.method) {
			case ReadyCommandType.method:
				onIpcCommand(ReadyCommandType, e, params => {
					this.notifyDidChangeData(this._editor);
				});

				break;

			case TimelineClickCommandType.method:
				onIpcCommand(TimelineClickCommandType, e, async params => {
					if (params.data === undefined || this._editor === undefined) return;

					const commandArgs: DiffWithPreviousCommandArgs = {
						line: 0,
						showOptions: {
							preserveFocus: true,
							preview: true,
							viewColumn: ViewColumn.Beside
						}
					};

					const gitUri = await GitUri.fromUri(this._editor.document.uri);

					commands.executeCommand(
						Commands.DiffWithPrevious,
						new GitUri(gitUri, { repoPath: gitUri.repoPath!, sha: params.data.id }),
						commandArgs
					);
				});

				break;

			default:
				super.onMessageReceived(e);

				break;
		}
	}

	get filename(): string {
		return 'timeline.html';
	}

	get id(): string {
		return 'gitlens.timeline';
	}

	get title(): string {
		return 'GitLens Timeline';
	}

	private async getData(editor: TextEditor | undefined): Promise<TimelineData | undefined> {
		if (editor == undefined) {
			this.setTitle('GitLens Timeline');

			return undefined;
		}

		const gitUri = await GitUri.fromUri(editor.document.uri);

		this.setTitle(`Timeline of ${gitUri.fileName}`);

		const [currentUser, log] = await Promise.all([
			Container.git.getCurrentUser(gitUri.repoPath!),
			Container.git.getLogForFile(gitUri.repoPath, gitUri.fsPath, {
				ref: gitUri.sha
			})
		]);

		if (log === undefined) return undefined;

		const name = currentUser && currentUser.name ? `${currentUser.name} (you)` : 'You';

		const dataset = [];
		for (const commit of log.commits.values()) {
			const diff = commit.getDiffStatus();
			dataset.push({
				author: commit.author === 'You' ? name : commit.author,
				changes: diff.added + diff.changed + diff.deleted,
				added: diff.added,
				deleted: diff.deleted,
				commit: commit.sha,
				date: commit.date,
				message: commit.message
			});
		}

		dataset.sort((a, b) => a.date.getTime() - b.date.getTime());

		return { fileName: gitUri.relativePath, dataset: dataset };
	}

	private async notifyDidChangeData(editor: TextEditor | undefined) {
		return this.notify(TimelineDidChangeDataNotificationType, {
			data: await this.getData(editor)
		});
	}
}
