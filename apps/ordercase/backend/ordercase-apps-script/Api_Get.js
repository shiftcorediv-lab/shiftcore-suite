/****************************************************
 * Api_Get.gs
 * GET API
 ****************************************************/


/****************************************************
 * handleGet_ ここから
 * GETリクエストの振り分け
 ****************************************************/
function handleGet_(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action || '';

    if (action === 'bootstrap') {
      const context = requireOrderCaseViewer_(getIdTokenFromParams_(params));

      return jsonResponse_({
        ok: true,
        action: action,
        data: getBootstrapData_()
      });
    }

    if (action === 'getCaseTypes') {
      const context = requireOrderCaseViewer_(getIdTokenFromParams_(params));

      return jsonResponse_({
        ok: true,
        action: action,
        data: {
          case_types: getActiveCaseTypes_()
        }
      });
    }


    /****************************************************
     * getOrderCasePermission ここから
     * OrderCaseの現在ユーザー権限を返す
     ****************************************************/
    if (action === 'getOrderCasePermission') {
      const context = requireOrderCaseViewer_(getIdTokenFromParams_(params));

      return jsonResponse_({
        ok: true,
        action: action,
        permission: context.permission,
        data: {
          permission: context.permission,
          can_edit: context.canEdit,
          can_view_amount: context.canViewAmount,
          can_manage: context.canManage,
          user: {
            email: context.user.email || '',
            name: context.user.name || context.user.displayName || '',
            role: context.user.role || ''
          }
        }
      });
    }
    /****************************************************
     * getOrderCasePermission ここまで
     ****************************************************/


    if (action === 'listPageData') {
      const context = requireOrderCaseViewer_(getIdTokenFromParams_(params));
      const data = getListPageData_(params);

      return jsonResponse_({
        ok: true,
        action: action,
        permission: context.permission,
        data: applyOrderCaseVisibility_(data, context)
      });
    }

    if (action === 'listCases') {
      const context = requireOrderCaseViewer_(getIdTokenFromParams_(params));
      const data = listCases_(params);

      return jsonResponse_({
        ok: true,
        action: action,
        permission: context.permission,
        data: applyOrderCaseVisibility_(data, context)
      });
    }

    if (action === 'getCaseDetail') {
      const context = requireOrderCaseViewer_(getIdTokenFromParams_(params));
      const data = getCaseDetail_(params.case_id);

      return jsonResponse_({
        ok: true,
        action: action,
        permission: context.permission,
        data: applyOrderCaseVisibility_(data, context)
      });
    }


    /****************************************************
     * getCaseDetailPageData ここから
     * 案件詳細画面用に詳細＋変更履歴を高速取得して返す
     * view_without_amount では金額情報と変更履歴を返さない
     ****************************************************/
    if (action === 'getCaseDetailPageData') {
      const context = requireOrderCaseViewer_(getIdTokenFromParams_(params));

      const pageData = getCaseDetailPageDataFast_(params.case_id, params);

      return jsonResponse_({
        ok: true,
        action: action,
        permission: context.permission,
        data: {
          case_detail: applyOrderCaseVisibility_(pageData.case_detail, context),
          change_logs: context.canViewAmount ? pageData.change_logs : []
        }
      });
    }
    /****************************************************
     * getCaseDetailPageData ここまで
     ****************************************************/


    /****************************************************
     * getCaseChangeLogs ここから
     * 指定案件の変更履歴を返す
     ****************************************************/
    if (action === 'getCaseChangeLogs') {
      const context = requireOrderCaseViewer_(getIdTokenFromParams_(params));

      return jsonResponse_({
        ok: true,
        action: action,
        permission: context.permission,
        data: context.canViewAmount ? getCaseChangeLogs_(params.case_id) : []
      });
    }
    /****************************************************
     * getCaseChangeLogs ここまで
     ****************************************************/

    return jsonResponse_({
      ok: false,
      code: 'UNKNOWN_ACTION',
      message: '不明なactionです。',
      received_action: action
    });

  } catch (error) {
    return jsonResponse_({
      ok: false,
      code: 'SERVER_ERROR',
      message: error.message,
      stack: error.stack
    });
  }
}
/****************************************************
 * handleGet_ ここまで
 ****************************************************/