/****************************************************
 * getListPageData_ ここから
 * 一覧画面に必要なデータを1回で返す
 * 同じ検索条件は60秒キャッシュして高速化する
 * force_refresh=1 の場合はキャッシュを使わず最新取得する
 ****************************************************/
function getListPageData_(params) {
  const safeParams = params || {};
  const forceRefresh =
    String(safeParams.force_refresh || '').trim() === '1' ||
    String(safeParams.forceRefresh || '').trim() === '1';

  const cache = CacheService.getScriptCache();
  const cacheKey = buildListPageDataCacheKey_(safeParams);

  if (!forceRefresh) {
    const cachedText = cache.get(cacheKey);

    if (cachedText) {
      try {
        return JSON.parse(cachedText);
      } catch (error) {
        // キャッシュ破損時は無視して再取得する
      }
    }
  }

  const data = {
    case_types: getActiveCaseTypes_(),
    cases: listCases_(safeParams)
  };

  cache.put(cacheKey, JSON.stringify(data), 60);

  return data;
}
/****************************************************
 * getListPageData_ ここまで
 ****************************************************/

 /****************************************************
 * buildListPageDataCacheKey_ ここから
 * 一覧キャッシュキーを作る
 ****************************************************/
function buildListPageDataCacheKey_(params) {
  const safeParams = params || {};

  const cacheTarget = {
    target_month: String(safeParams.target_month || '').trim(),
    keyword: String(safeParams.keyword || '').trim(),
    status: String(safeParams.status || '').trim(),
    case_type: String(safeParams.case_type || '').trim()
  };

  const rawKey = JSON.stringify(cacheTarget);

  const digest = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      rawKey
    )
  ).slice(0, 80);

  return 'list_page_data_' + digest;
}
/****************************************************
 * buildListPageDataCacheKey_ ここまで
 ****************************************************/