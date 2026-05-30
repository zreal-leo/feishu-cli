import type { FeishuDocCommand } from './message.js';

type FeishuDocxRawContentResponse = {
    code?: number;
    msg?: string;
    data?: {
        content?: string;
    };
};

type FeishuWikiNodeResponse = {
    code?: number;
    msg?: string;
    data?: {
        node?: {
            obj_token?: string;
            obj_type?: string;
            title?: string;
        };
    };
};

export type FeishuDocApiClient = {
    docx: {
        v1: {
            document: {
                rawContent: (payload: { path: { document_id: string }; params?: { lang?: number } }) => Promise<FeishuDocxRawContentResponse>;
            };
        };
    };
    wiki?: {
        v2?: {
            space?: {
                getNode: (payload: { params: { token: string; obj_type?: 'docx' | 'wiki' } }) => Promise<FeishuWikiNodeResponse>;
            };
        };
    };
};

export type FeishuDocContent = {
    content: string;
    title?: string;
};

export type FetchFeishuDocContent = (command: FeishuDocCommand) => Promise<FeishuDocContent>;

export function createFeishuDocContentFetcher(client: FeishuDocApiClient): FetchFeishuDocContent {
    return async command => {
        if (command.resourceType === 'docx') {
            return {
                content: await fetchDocxRawContent(client, command.token)
            };
        }

        const wikiNode = await fetchWikiNode(client, command.token);
        if (wikiNode.objType !== 'docx') {
            throw new Error(`暂不支持读取 ${wikiNode.objType || 'unknown'} 类型的知识库节点。请提供新版文档（docx）链接。`);
        }

        if (!wikiNode.objToken) {
            throw new Error('知识库节点未返回文档 token。');
        }

        return {
            content: await fetchDocxRawContent(client, wikiNode.objToken),
            title: wikiNode.title
        };
    };
}

async function fetchDocxRawContent(client: FeishuDocApiClient, documentId: string): Promise<string> {
    const response = await client.docx.v1.document.rawContent({
        path: {
            document_id: documentId
        }
    });

    if (!response.data || typeof response.data.content !== 'string') {
        throw new Error(formatFeishuApiError(response, '飞书文档未返回纯文本内容。'));
    }

    return response.data.content;
}

async function fetchWikiNode(client: FeishuDocApiClient, token: string): Promise<{ objToken?: string; objType?: string; title?: string }> {
    const getNode = client.wiki?.v2?.space?.getNode;
    if (!getNode) {
        throw new Error('飞书知识库读取能力未配置。');
    }

    const response = await getNode({
        params: {
            token,
            obj_type: 'wiki'
        }
    });
    const node = response.data?.node;

    if (!node) {
        throw new Error(formatFeishuApiError(response, '飞书知识库节点不存在或无权限读取。'));
    }

    return {
        objToken: node.obj_token,
        objType: node.obj_type,
        title: node.title
    };
}

function formatFeishuApiError(response: { code?: number; msg?: string }, fallback: string): string {
    if (typeof response.code === 'number' && response.code !== 0) {
        return `${fallback}（code=${response.code}${response.msg ? `, msg=${response.msg}` : ''}）`;
    }

    return fallback;
}
