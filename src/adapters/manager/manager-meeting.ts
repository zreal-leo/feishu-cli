import type { CloudPlayerCommandOptions, MeetingParameterOptions } from '../../core/meeting.ts';
import type { CreateMeetingRequest, MeetingGateway } from '../../ports/meeting.ts';

type FetchLike = typeof fetch;

export type ManagerMeetingConfig = {
    env: 'test';
    baseUrl: string;
    loginName?: string;
    password?: string;
};

export type CreateManagerMeetingRequest = MeetingParameterOptions & {
    title: string;
    startAfterMinutes?: number;
    now?: Date;
    cloudPlayer?: CloudPlayerCommandOptions;
};

export type ManagerMeetingResult = {
    title: string;
    roadshowId: number;
    eventId: number;
    netLiveUrl: string;
    cloudPlayerCreated?: boolean;
    cloudPlayerError?: string;
};

export type ManagerMeetingClient = {
    createMeeting: (request: CreateManagerMeetingRequest) => Promise<ManagerMeetingResult>;
};

const DEFAULT_START_AFTER_MINUTES = 3;
const MANAGER_LOGIN_ORIGIN = 'manager-test.comein.cn';
const DEFAULT_MEETING_LOGO = 'https://image.comein.cn/comein-files/img/1ead173108694842bcbea9227c70b4ce.jpg';
const MANAGER_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const MEETING_TITLE_TIME_ZONE = 'Asia/Shanghai';
const MEETING_TITLE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
    timeZone: MEETING_TITLE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

type ManagerLoginVerificationPayload = {
    id: string | number;
    loginName: string;
    password: string;
};

class ManagerTokenExpiredError extends Error {
    constructor(body: unknown) {
        super(`后台 token 已失效: ${JSON.stringify(body)}`);
        this.name = 'ManagerTokenExpiredError';
    }
}

export function createManagerMeetingGateway(config: ManagerMeetingConfig, fetchImpl: FetchLike = fetch): MeetingGateway {
    const client = createManagerMeetingClient(config, fetchImpl);

    return {
        createMeeting(request: CreateMeetingRequest) {
            return client.createMeeting(request);
        }
    };
}

export function createManagerMeetingClient(config: ManagerMeetingConfig, fetchImpl: FetchLike = fetch): ManagerMeetingClient {
    let cachedToken: string | undefined;

    return {
        async createMeeting(request) {
            const token = cachedToken || (await getManagerToken(config, fetchImpl));
            cachedToken = token;
            try {
                return await createManagerMeeting(config, request, token, fetchImpl);
            } catch (error) {
                if (!(error instanceof ManagerTokenExpiredError)) {
                    throw error;
                }

                cachedToken = undefined;
                const refreshedToken = await getManagerToken(config, fetchImpl);
                cachedToken = refreshedToken;
                return createManagerMeeting(config, request, refreshedToken, fetchImpl);
            }
        }
    };
}

export async function getManagerToken(config: ManagerMeetingConfig, fetchImpl: FetchLike = fetch): Promise<string> {
    if (!config.loginName || !config.password) {
        throw new Error('缺少运营后台登录变量 MANAGER_LOGIN_NAME、MANAGER_PASSWORD。');
    }

    const loginBody = await readManagerJson(
        await fetchImpl(joinManagerUrl(config.baseUrl, '/system/login'), {
            method: 'POST',
            headers: {
                accept: '*/*',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                b: '3.0.3',
                browse: 'Netscape',
                'content-type': 'application/json;charset=utf-8',
                currentuid: '297',
                origin: 'https://manager-test.comein.cn',
                priority: 'u=1, i',
                'sec-ch-ua': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                token: 'null',
                ua: MANAGER_BROWSER_UA,
                uc: 'comein-pc',
                'user-agent': MANAGER_BROWSER_UA
            },
            body: JSON.stringify({
                loginName: config.loginName,
                password: config.password,
                origin: MANAGER_LOGIN_ORIGIN
            })
        }),
        '登录运营后台'
    );
    const verificationPayload = buildLoginVerificationPayload(loginBody);

    const body = await readManagerJson(
        await fetchImpl(joinManagerUrl(config.baseUrl, '/system/verifyCode'), {
            method: 'POST',
            body: JSON.stringify({
                ...verificationPayload,
                code: null,
                origin: MANAGER_LOGIN_ORIGIN
            })
        }),
        '获取后台 token'
    );
    const token = getNestedString(body, ['data', 'token']);
    if (!token) {
        throw new Error(`获取后台 token 失败: ${JSON.stringify(body)}`);
    }

    return token;
}

function buildLoginVerificationPayload(loginBody: unknown): ManagerLoginVerificationPayload {
    const data = getObjectValue(loginBody, 'data');
    const id = getObjectValue(data, 'id');
    const loginName = getStringValue(data, 'loginName');
    const password = getStringValue(data, 'password');

    if ((typeof id !== 'number' && typeof id !== 'string') || !loginName || !password) {
        throw new Error(`登录运营后台响应缺少 id、loginName 或 password: ${JSON.stringify(loginBody)}`);
    }

    return {
        id,
        loginName,
        password
    };
}

export async function createManagerMeeting(config: ManagerMeetingConfig, request: CreateManagerMeetingRequest, token: string, fetchImpl: FetchLike = fetch): Promise<ManagerMeetingResult> {
    const stimeMs = resolveStartTimeMs(request);
    const payload = buildMeetingPayload(request.title, stimeMs, request);
    const title = getStringValue(payload, 'title');
    if (!title) {
        throw new Error('创建会议 payload 缺少 title。');
    }

    const body = await readManagerJson(
        await fetchImpl(joinManagerUrl(config.baseUrl, '/managecenter/roadshow/create'), {
            method: 'POST',
            headers: {
                token,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        }),
        '创建会议'
    );

    if (isManagerTokenExpiredResponse(body)) {
        throw new ManagerTokenExpiredError(body);
    }

    if (String(getObjectValue(body, 'code')) !== '0') {
        throw new Error(`创建会议失败: ${JSON.stringify(body)}`);
    }

    const data = getObjectValue(body, 'data');
    const roadshowId = getNumberValue(data, 'id');
    const eventId = getNumberValue(data, 'eid');
    const netLiveUrl = getStringValue(data, 'netLiveUrl');

    if (roadshowId === undefined || eventId === undefined || !netLiveUrl) {
        throw new Error(`创建会议响应缺少必要字段: ${JSON.stringify(body)}`);
    }

    const result: ManagerMeetingResult = {
        title,
        roadshowId,
        eventId,
        netLiveUrl
    };

    if (request.cloudPlayer) {
        try {
            await createManagerCloudPlayer(config, request.cloudPlayer, roadshowId, Math.floor(stimeMs / 1000), token, fetchImpl);
            result.cloudPlayerCreated = true;
        } catch (error) {
            result.cloudPlayerError = error instanceof Error ? error.message : String(error);
        }
    }

    return result;
}

export function buildMeetingPayload(title: string, stimeMs: number, options: MeetingParameterOptions = {}): Record<string, unknown> {
    const fullTitle = formatMeetingTitle(title, new Date(stimeMs));

    return {
        eventType: 2,
        htmlInfo: { title: '内容：', content: '直播间测试' },
        stime: stimeMs,
        logo: DEFAULT_MEETING_LOGO,
        logoWeb: DEFAULT_MEETING_LOGO,
        logoWall: DEFAULT_MEETING_LOGO,
        logoWall169: DEFAULT_MEETING_LOGO,
        isDownload: 1,
        description: '欢迎来到直播间',
        length: options.length ?? 120,
        title: fullTitle,
        preparationMode: 0,
        uid: 15281329,
        industryTagIds: '565,558',
        submit: 1,
        openStatus: options.openStatus ?? 1,
        eventWays: options.eventWays ?? 1,
        showAgreement: 0,
        remoteCheck: 1,
        isSyncRoom: 1,
        rtcProvider: 1,
        recordSupport: 1,
        contentTypeTagIds: '521',
        goodsPrice: 100,
        onStatus: 1,
        status: 0,
        organizationId: 747,
        interactiveMode: 0,
        isSupportConf: 1,
        isSyncAdvance: 1,
        subTitle: '   ',
        adminId: 22,
        adminName: '管理员账号',
        contentInfo: '测试使用123',
        serviceType: options.serviceType ?? 0,
        serviceId: '1357',
        eventMode: options.eventMode ?? 567,
        marketTagIds: '519,520',
        researchDirectionTagIds: '1056',
        speakerTagIds: 1091,
        topicIds: '942',
        stockIds: '',
        isTest: 0,
        isHide: 0,
        isEx: 0,
        needAssistant: 1,
        assistantIds: '',
        liveNotice: '',
        subscribeUser: '',
        delQuartzTime: '',
        limitRegionType: 1,
        chargeType: 1,
        verifyCode: '1234',
        whiteIds: '',
        filterType: 2,
        meetingUserSetting: 1,
        filterAreaCodeList: '',
        tagName: options.tagName ?? '公开',
        sendScheduleEventMsgAuto: 1,
        watermark: 0,
        watermarkRoadshow: 0,
        watermarkWhiteNoise: 0,
        watermarkType: 1,
        voiceInterpretation: 0,
        subtitleSwitch: 1,
        subtitleTranslation: 1,
        sourceLanguage: -1,
        transDestLanguage: [0, 1, 2],
        selectedTransChannels: ['cn', 'en', 'jp'],
        analystIndustryIds: '',
        questionCollectSelect: 1,
        disclaimer: '我是免责声明',
        isAdShow: 0,
        isNet: 1,
        isGenerateMeetSummary: 1,
        enableComeinAiSum: 1,
        enableQaAudit: 1,
        autoCall: 1,
        interactionType: 0,
        passCodeType: 0,
        autoBegin: 1,
        autoEnd: 0,
        audioState: 0,
        audioTitle: fullTitle,
        removePhoneIds: '2506',
        attendee: [
            {
                name: '联席主讲人',
                areaCode: '+86',
                phoneNumber: '1871872',
                company: '测试机构',
                occupation: '副董事长',
                identity: '2',
                isShow: 1,
                identityTypes: '4,7'
            }
        ],
        enableInteractiveMode: 1,
        enableHandUpQa: 1,
        enableTextQa: 1,
        audioPlayType: 0,
        passGroupId: 1,
        reviewType: 0,
        hotWordMeetSummary: ''
    };
}

function resolveStartTimeMs(request: CreateManagerMeetingRequest): number {
    if (request.stimeMs !== undefined) {
        return request.stimeMs;
    }

    const nowMs = request.now?.getTime() ?? Date.now();
    return nowMs + (request.startAfterMinutes ?? DEFAULT_START_AFTER_MINUTES) * 60 * 1000;
}

async function createManagerCloudPlayer(config: ManagerMeetingConfig, cloudPlayer: CloudPlayerCommandOptions, roadshowId: number, playTs: number, token: string, fetchImpl: FetchLike): Promise<void> {
    const body = await readManagerJson(
        await fetchImpl(joinManagerUrl(config.baseUrl, '/managecenter/cloud-player/create'), {
            method: 'POST',
            headers: {
                token,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                roadshowId,
                mediaStreamType: cloudPlayer.mediaStreamType,
                streamUrl: cloudPlayer.streamUrl,
                playType: cloudPlayer.playType,
                repeatMode: cloudPlayer.repeatMode,
                repeatTime: cloudPlayer.repeatTime,
                playTs,
                region: null,
                type: cloudPlayer.type
            })
        }),
        '创建云播'
    );

    if (String(getObjectValue(body, 'code')) !== '0') {
        throw new Error(`创建云播失败: ${JSON.stringify(body)}`);
    }
}

async function readManagerJson(response: Response, action: string): Promise<unknown> {
    const text = await response.text();
    let body: unknown;

    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(`${action}失败: 后台返回非 JSON 响应，HTTP ${response.status}`);
    }

    if (!response.ok) {
        throw new Error(`${action}失败: HTTP ${response.status} ${JSON.stringify(body)}`);
    }

    return body;
}

function joinManagerUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function formatMeetingTitle(topic: string, date: Date): string {
    const parts = MEETING_TITLE_TIME_FORMATTER.formatToParts(date);
    const hours = parts.find(part => part.type === 'hour')?.value ?? '00';
    const minutes = parts.find(part => part.type === 'minute')?.value ?? '00';
    return `BOT: ${topic} ${hours}:${minutes}`;
}

function getNestedString(value: unknown, path: string[]): string | undefined {
    let current = value;
    for (const key of path) {
        current = getObjectValue(current, key);
    }

    return typeof current === 'string' && current.trim() ? current.trim() : undefined;
}

function getObjectValue(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function isManagerTokenExpiredResponse(body: unknown): boolean {
    return getResponseCode(body, 'errorcode') === '201' || getResponseCode(body, 'errorCode') === '201' || getResponseCode(body, 'code') === '201';
}

function getResponseCode(value: unknown, key: string): string | undefined {
    const rawValue = getObjectValue(value, key);
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        return String(rawValue);
    }

    return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : undefined;
}

function getNumberValue(value: unknown, key: string): number | undefined {
    const rawValue = getObjectValue(value, key);
    return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : undefined;
}

function getStringValue(value: unknown, key: string): string | undefined {
    const rawValue = getObjectValue(value, key);
    return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : undefined;
}
