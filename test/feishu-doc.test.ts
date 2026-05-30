import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFeishuDocContentFetcher } from '../src/feishu-doc.js';
import type { FeishuDocApiClient } from '../src/feishu-doc.js';
import type { FeishuDocCommand } from '../src/message.js';

function createDocCommand(token: string): FeishuDocCommand {
    return {
        type: 'feishu_doc',
        url: `https://example.feishu.cn/docx/${token}`,
        resourceType: 'docx',
        token,
        instruction: '列出需要国际化的文本'
    };
}

function createWikiCommand(token: string): FeishuDocCommand {
    return {
        type: 'feishu_doc',
        url: `https://example.feishu.cn/wiki/${token}`,
        resourceType: 'wiki',
        token,
        instruction: '列出需要国际化的文本'
    };
}

describe('createFeishuDocContentFetcher', () => {
    it('fetches raw content for a docx link', async () => {
        const requestedDocumentIds: string[] = [];
        const client: FeishuDocApiClient = {
            docx: {
                v1: {
                    document: {
                        rawContent: async payload => {
                            requestedDocumentIds.push(payload.path.document_id);
                            return { data: { content: '按钮：提交' } };
                        }
                    }
                }
            }
        };

        const fetchContent = createFeishuDocContentFetcher(client);
        const result = await fetchContent(createDocCommand('DocToken01'));

        assert.deepEqual(requestedDocumentIds, ['DocToken01']);
        assert.deepEqual(result, { content: '按钮：提交' });
    });

    it('resolves a wiki node before fetching docx raw content', async () => {
        const actions: string[] = [];
        const client: FeishuDocApiClient = {
            docx: {
                v1: {
                    document: {
                        rawContent: async payload => {
                            actions.push(`raw:${payload.path.document_id}`);
                            return { data: { content: '页面标题：设置' } };
                        }
                    }
                }
            },
            wiki: {
                v2: {
                    space: {
                        getNode: async payload => {
                            actions.push(`wiki:${payload.params.token}:${payload.params.obj_type}`);
                            return { data: { node: { obj_token: 'DocxFromWiki01', obj_type: 'docx', title: '设置页文案' } } };
                        }
                    }
                }
            }
        };

        const fetchContent = createFeishuDocContentFetcher(client);
        const result = await fetchContent(createWikiCommand('WikiToken01'));

        assert.deepEqual(actions, ['wiki:WikiToken01:wiki', 'raw:DocxFromWiki01']);
        assert.deepEqual(result, { content: '页面标题：设置', title: '设置页文案' });
    });

    it('rejects unsupported wiki node object types', async () => {
        const client: FeishuDocApiClient = {
            docx: {
                v1: {
                    document: {
                        rawContent: async () => ({ data: { content: '不应读取' } })
                    }
                }
            },
            wiki: {
                v2: {
                    space: {
                        getNode: async () => ({ data: { node: { obj_token: 'SheetToken01', obj_type: 'sheet' } } })
                    }
                }
            }
        };

        const fetchContent = createFeishuDocContentFetcher(client);

        await assert.rejects(fetchContent(createWikiCommand('WikiSheet01')), /暂不支持读取 sheet 类型/);
    });
});
