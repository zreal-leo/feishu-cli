export type ManagerEnvironment = 'test' | 'prod';

export type ManagerMeetingCommand = {
    title?: string;
};

export type ManagerMeetingResult = {
    id: number;
    eid: number;
    netLiveUrl: string;
};

export type HttpResponseLike = {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
};

export type HttpClient = (url: string, options: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<HttpResponseLike>;

export type CreateManagerMeetingOptions = {
    env: ManagerEnvironment;
    title?: string;
    token?: string;
    loginName?: string;
    password?: string;
    loginId?: string;
    code?: string;
    now?: Date;
    startAfterMinutes?: number;
    httpClient?: HttpClient;
};

const DEFAULT_MEETING_TITLE = '自动化创建会议';
const DEFAULT_START_AFTER_MINUTES = 20;
const CREATE_MANAGER_MEETING_COMMAND_PATTERN = /^(?:\/?创建会议|\/?新建会议|\/?meeting)(?:\s+(.+))?$/i;

export function parseCreateManagerMeetingCommand(text: string): ManagerMeetingCommand | null {
    const match = text.trim().match(CREATE_MANAGER_MEETING_COMMAND_PATTERN);
    if (!match) {
        return null;
    }

    const title = match[1]?.trim();
    return { title: title || undefined };
}

export function getManagerBaseUrl(env: ManagerEnvironment): string {
    return env === 'prod' ? 'https://server.comein.cn/comein/manager' : 'https://testserver.comein.cn/comein/manager';
}

export function buildManagerMeetingPayload(options: { env: ManagerEnvironment; title?: string; startTimeMs: number; now?: Date }): Record<string, any> {
    const isProd = options.env === 'prod';
    const title = `${options.title?.trim() || DEFAULT_MEETING_TITLE}_${formatTitleTime(options.now ?? new Date())}`;

    return {
        eventType: 2,
        htmlInfo: {
            title: '内容：',
            content: '直播间测试'
        },
        stime: options.startTimeMs,
        logo: 'https://example.com/logo.png',
        logoWeb: 'https://example.com/logo-web.png',
        logoWall: 'https://example.com/logo-wall.png',
        logoWall169: 'https://example.com/logo-wall-169.png',
        isDownload: 1,
        description: '欢迎来到直播间',
        length: 120,
        title,
        preparationMode: 0,
        uid: isProd ? 2314049 : 15281329,
        industryTagIds: isProd ? '' : '565,558',
        submit: 1,
        openStatus: 1,
        eventWays: 1,
        showAgreement: 0,
        remoteCheck: 1,
        isSyncRoom: 1,
        rtcProvider: 1,
        recordSupport: 1,
        contentTypeTagIds: '521',
        goodsPrice: 100,
        onStatus: 1,
        status: 0,
        organizationId: isProd ? 20164 : 747,
        interactiveMode: 0,
        isSupportConf: 1,
        isSyncAdvance: 1,
        subTitle: '   ',
        adminId: 22,
        adminName: '管理员账号',
        contentInfo: '测试使用123',
        serviceType: 7,
        serviceId: isProd ? '1002' : '1357',
        eventMode: isProd ? 684 : 567,
        marketTagIds: isProd ? '696,697' : '519,520',
        researchDirectionTagIds: '1056',
        speakerTagIds: 1091,
        topicIds: isProd ? '' : '942',
        stockIds: '',
        isTest: isProd ? 1 : 0,
        isHide: isProd ? 1 : 0,
        isEx: 0,
        needAssistant: isProd ? 0 : 1,
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
        tagName: '公开',
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
        audioTitle: title,
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

export async function createManagerMeeting(options: CreateManagerMeetingOptions): Promise<ManagerMeetingResult> {
    const httpClient = options.httpClient ?? defaultHttpClient;
    const managerBaseUrl = getManagerBaseUrl(options.env);
    const token = await getManagerToken(managerBaseUrl, options, httpClient);
    const now = options.now ?? new Date();
    const startAfterMinutes = options.startAfterMinutes ?? DEFAULT_START_AFTER_MINUTES;
    const payload = buildManagerMeetingPayload({
        env: options.env,
        title: options.title,
        now,
        startTimeMs: now.getTime() + startAfterMinutes * 60 * 1000
    });

    const response = await httpClient(`${managerBaseUrl}/managecenter/roadshow/create`, {
        method: 'POST',
        headers: {
            token,
            'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const body = await readJsonObject(response);

    if (!response.ok || String(body.code) !== '0') {
        throw new Error(`创建管理后台会议失败: ${JSON.stringify(body)}`);
    }

    const data = asRecord(body.data);
    const id = parsePositiveNumber(data.id);
    const eid = parsePositiveNumber(data.eid);
    const netLiveUrl = typeof data.netLiveUrl === 'string' ? data.netLiveUrl.trim() : '';

    if (!id || !eid || !netLiveUrl) {
        throw new Error(`创建管理后台会议响应缺少必要字段: ${JSON.stringify(body)}`);
    }

    return { id, eid, netLiveUrl };
}

export function formatManagerMeetingReply(meeting: ManagerMeetingResult): string {
    return [`会议已创建`, `会议 ID：${meeting.id}`, `事件 ID：${meeting.eid}`, `观看链接：${meeting.netLiveUrl}`].join('\n');
}

async function getManagerToken(managerBaseUrl: string, options: CreateManagerMeetingOptions, httpClient: HttpClient): Promise<string> {
    const token = options.token?.trim();
    if (token) {
        return token;
    }

    const loginName = requireOption(options.loginName, 'MANAGER_LOGIN_NAME');
    const password = requireOption(options.password, 'MANAGER_PASSWORD');
    const loginId = requireOption(options.loginId, 'MANAGER_LOGIN_ID');
    const code = requireOption(options.code, 'MANAGER_CODE');
    const params = new URLSearchParams({
        loginName,
        password,
        id: loginId,
        code
    });

    const response = await httpClient(`${managerBaseUrl}/system/verifyCode?${params.toString()}`, {
        method: 'GET'
    });
    const body = await readJsonObject(response);
    const responseToken = asRecord(body.data).token;

    if (!response.ok || typeof responseToken !== 'string' || responseToken.trim().length === 0) {
        throw new Error(`获取管理后台 token 失败: ${JSON.stringify(body)}`);
    }

    return responseToken.trim();
}

async function readJsonObject(response: HttpResponseLike): Promise<Record<string, unknown>> {
    const body = await response.json();
    return asRecord(body);
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function requireOption(value: string | undefined, name: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return trimmed;
}

function parsePositiveNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' && typeof value !== 'string') {
        return undefined;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
        return undefined;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function formatTitleTime(date: Date): string {
    return [padTwoDigits(date.getUTCMonth() + 1), '-', padTwoDigits(date.getUTCDate()), '_', padTwoDigits(date.getUTCHours()), ':', padTwoDigits(date.getUTCMinutes()), ':', padTwoDigits(date.getUTCSeconds())].join('');
}

function padTwoDigits(value: number): string {
    return String(value).padStart(2, '0');
}

async function defaultHttpClient(url: string, options: { method?: string; headers?: Record<string, string>; body?: string }): Promise<HttpResponseLike> {
    return fetch(url, options);
}
