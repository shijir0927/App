import {useIsFocused} from '@react-navigation/native';
import {deepEqual} from 'fast-equals';
import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {View} from 'react-native';
import type {OnyxCollection, OnyxEntry} from 'react-native-onyx';
import {withOnyx} from 'react-native-onyx';
import type {EdgeInsets} from 'react-native-safe-area-context';
import type {ValueOf} from 'type-fest';
import useActiveWorkspace from '@hooks/useActiveWorkspace';
import useCurrentReportID from '@hooks/useCurrentReportID';
import useCurrentUserPersonalDetails from '@hooks/useCurrentUserPersonalDetails';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import usePrevious from '@hooks/usePrevious';
import useThemeStyles from '@hooks/useThemeStyles';
import {getPolicyMembersByIdWithoutCurrentUser} from '@libs/PolicyUtils';
import * as ReportUtils from '@libs/ReportUtils';
import SidebarUtils from '@libs/SidebarUtils';
import * as Policy from '@userActions/Policy';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type * as OnyxTypes from '@src/types/onyx';
import type {Message} from '@src/types/onyx/ReportAction';
import SidebarLinks from './SidebarLinks';

type SidebarLinksDataOnyxProps = {
    chatReports: OnyxEntry<
        Pick<
            OnyxTypes.Report,
            | 'reportID'
            | 'participantAccountIDs'
            | 'hasDraft'
            | 'isPinned'
            | 'isHidden'
            | 'notificationPreference'
            | 'errorFields'
            | 'lastMessageText'
            | 'lastVisibleActionCreated'
            | 'iouReportID'
            | 'total'
            | 'nonReimbursableTotal'
            | 'hasOutstandingChildRequest'
            | 'isWaitingOnBankAccount'
            | 'statusNum'
            | 'stateNum'
            | 'chatType'
            | 'type'
            | 'policyID'
            | 'visibility'
            | 'lastReadTime'
            | 'reportName'
            | 'policyName'
            | 'oldPolicyName'
            | 'ownerAccountID'
            | 'currency'
            | 'managerID'
            | 'parentReportActionID'
            | 'parentReportID'
            | 'isDeletedParentAction'
        > & {isUnreadWithMention: boolean}
    >;
    isLoadingApp: OnyxEntry<boolean>;
    priorityMode: OnyxEntry<ValueOf<typeof CONST.PRIORITY_MODE>>;
    betas: OnyxEntry<OnyxTypes.Beta[]>;
    allReportActions: OnyxEntry<Array<Pick<OnyxTypes.ReportAction, 'reportActionID' | 'actionName' | 'errors' | 'message'>>>;
    policies: OnyxEntry<Pick<OnyxTypes.Policy, 'type' | 'name' | 'avatar'>>;
    policyMembers: OnyxCollection<OnyxTypes.PolicyMembers>;
    transactionViolations: OnyxCollection<OnyxTypes.TransactionViolations>;
};

type SidebarLinksDataProps = SidebarLinksDataOnyxProps & {
    onLinkClick: () => void;
    insets: EdgeInsets;
};

function SidebarLinksData({
    allReportActions,
    betas,
    chatReports,
    insets,
    isLoadingApp = true,
    onLinkClick,
    policies,
    priorityMode = CONST.PRIORITY_MODE.DEFAULT,
    policyMembers,
    // session: {accountID},
    transactionViolations,
}: SidebarLinksDataProps) {
    const {currentReportID} = useCurrentReportID() ?? {};
    const {accountID} = useCurrentUserPersonalDetails();
    const network = useNetwork();
    const isFocused = useIsFocused();
    const styles = useThemeStyles();
    const {activeWorkspaceID} = useActiveWorkspace();
    const {translate} = useLocalize();
    const prevPriorityMode = usePrevious(priorityMode);
    const policyMemberAccountIDs = getPolicyMembersByIdWithoutCurrentUser(policyMembers, activeWorkspaceID, accountID);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => Policy.openWorkspace(activeWorkspaceID ?? '', policyMemberAccountIDs), [activeWorkspaceID]);

    const reportIDsRef = useRef<string[] | null>(null);
    const isLoading = isLoadingApp;
    const optionListItems: string[] | null = useMemo(() => {
        const reportIDs = SidebarUtils.getOrderedReportIDs(
            null,
            chatReports as OnyxEntry<Record<string, OnyxTypes.Report>>,
            betas,
            policies as OnyxEntry<Record<string, OnyxTypes.Policy>>,
            priorityMode,
            allReportActions as OnyxEntry<Record<string, OnyxTypes.ReportAction[]>>,
            transactionViolations,
            activeWorkspaceID,
            policyMemberAccountIDs,
        );

        if (deepEqual(reportIDsRef.current, reportIDs)) {
            return reportIDsRef.current;
        }

        // 1. We need to update existing reports only once while loading because they are updated several times during loading and causes this regression: https://github.com/Expensify/App/issues/24596#issuecomment-1681679531
        // 2. If the user is offline, we need to update the reports unconditionally, since the loading of report data might be stuck in this case.
        // 3. Changing priority mode to Most Recent will call OpenApp. If there is an existing reports and the priority mode is updated, we want to immediately update the list instead of waiting the OpenApp request to complete
        if (!isLoading || !reportIDsRef.current || !!network.isOffline || (reportIDsRef.current && prevPriorityMode !== priorityMode)) {
            reportIDsRef.current = reportIDs;
        }
        return reportIDsRef.current || [];
    }, [chatReports, betas, policies, priorityMode, allReportActions, transactionViolations, activeWorkspaceID, policyMemberAccountIDs, isLoading, network.isOffline, prevPriorityMode]);

    // We need to make sure the current report is in the list of reports, but we do not want
    // to have to re-generate the list every time the currentReportID changes. To do that
    // we first generate the list as if there was no current report, then here we check if
    // the current report is missing from the list, which should very rarely happen. In this
    // case we re-generate the list a 2nd time with the current report included.
    const optionListItemsWithCurrentReport = useMemo(() => {
        if (currentReportID && !optionListItems?.includes(currentReportID)) {
            return SidebarUtils.getOrderedReportIDs(
                currentReportID,
                chatReports as OnyxEntry<Record<string, OnyxTypes.Report>>,
                betas,
                policies as OnyxEntry<Record<string, OnyxTypes.Policy>>,
                priorityMode,
                allReportActions as OnyxEntry<Record<string, OnyxTypes.ReportAction[]>>,
                transactionViolations,
                activeWorkspaceID,
                policyMemberAccountIDs,
            );
        }
        return optionListItems;
    }, [currentReportID, optionListItems, chatReports, betas, policies, priorityMode, allReportActions, transactionViolations, activeWorkspaceID, policyMemberAccountIDs]);

    const currentReportIDRef = useRef(currentReportID);
    currentReportIDRef.current = currentReportID;
    const isActiveReport = useCallback((reportID: string) => currentReportIDRef.current === reportID, []);

    return (
        <View
            accessibilityElementsHidden={!isFocused}
            accessibilityLabel={translate('sidebarScreen.listOfChats')}
            style={[styles.flex1, styles.h100]}
        >
            <SidebarLinks
                // Forwarded props:
                onLinkClick={onLinkClick}
                insets={insets}
                priorityMode={priorityMode}
                // Data props:
                isActiveReport={isActiveReport}
                isLoading={isLoading}
                optionListItems={optionListItemsWithCurrentReport}
                activeWorkspaceID={activeWorkspaceID}
            />
        </View>
    );
}

SidebarLinksData.displayName = 'SidebarLinksData';

/**
 * This function (and the few below it), narrow down the data from Onyx to just the properties that we want to trigger a re-render of the component. This helps minimize re-rendering
 * and makes the entire component more performant because it's not re-rendering when a bunch of properties change which aren't ever used in the UI.
 * @param [report]
 */
const chatReportSelector = (report: OnyxEntry<OnyxTypes.Report>) =>
    report && {
        reportID: report.reportID,
        participantAccountIDs: report.participantAccountIDs,
        hasDraft: report.hasDraft,
        isPinned: report.isPinned,
        isHidden: report.isHidden,
        notificationPreference: report.notificationPreference,
        errorFields: {
            addWorkspaceRoom: report.errorFields?.addWorkspaceRoom,
        },
        lastMessageText: report.lastMessageText,
        lastVisibleActionCreated: report.lastVisibleActionCreated,
        iouReportID: report.iouReportID,
        total: report.total,
        nonReimbursableTotal: report.nonReimbursableTotal,
        hasOutstandingChildRequest: report.hasOutstandingChildRequest,
        isWaitingOnBankAccount: report.isWaitingOnBankAccount,
        statusNum: report.statusNum,
        stateNum: report.stateNum,
        chatType: report.chatType,
        type: report.type,
        policyID: report.policyID,
        visibility: report.visibility,
        lastReadTime: report.lastReadTime,
        // Needed for name sorting:
        reportName: report.reportName,
        policyName: report.policyName,
        oldPolicyName: report.oldPolicyName,
        // Other less obvious properites considered for sorting:
        ownerAccountID: report.ownerAccountID,
        currency: report.currency,
        managerID: report.managerID,
        // Other important less obivous properties for filtering:
        parentReportActionID: report.parentReportActionID,
        parentReportID: report.parentReportID,
        isDeletedParentAction: report.isDeletedParentAction,
        isUnreadWithMention: ReportUtils.isUnreadWithMention(report),
    };

const reportActionsSelector = (reportActions: OnyxEntry<OnyxTypes.ReportActions>) =>
    reportActions &&
    Object.values(reportActions).map((reportAction) => {
        const {reportActionID, actionName, errors} = reportAction;
        const decision = reportAction.message?.[0].moderationDecision?.decision;

        return {
            reportActionID,
            actionName,
            errors,
            message: [
                {
                    moderationDecision: {decision},
                },
            ] as Message[],
        };
    });

const policySelector = (policy: OnyxEntry<OnyxTypes.Policy>) =>
    policy && {
        type: policy.type,
        name: policy.name,
        avatar: policy.avatar,
    };

export default withOnyx<SidebarLinksDataProps, SidebarLinksDataOnyxProps>({
    chatReports: {
        key: ONYXKEYS.COLLECTION.REPORT,
        selector: chatReportSelector,
        initialValue: {},
    },
    isLoadingApp: {
        key: ONYXKEYS.IS_LOADING_APP,
    },
    priorityMode: {
        key: ONYXKEYS.NVP_PRIORITY_MODE,
        initialValue: CONST.PRIORITY_MODE.DEFAULT,
    },
    betas: {
        key: ONYXKEYS.BETAS,
        initialValue: [],
    },
    allReportActions: {
        key: ONYXKEYS.COLLECTION.REPORT_ACTIONS,
        selector: reportActionsSelector,
        initialValue: {},
    },
    policies: {
        key: ONYXKEYS.COLLECTION.POLICY,
        selector: policySelector,
        initialValue: {},
    },
    policyMembers: {
        key: ONYXKEYS.COLLECTION.POLICY_MEMBERS,
    },
    transactionViolations: {
        key: ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS,
        initialValue: {},
    },
})(SidebarLinksData);
