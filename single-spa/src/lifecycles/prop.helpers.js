import * as singleSpa from "../single-spa.js";
import { mountParcel } from "../parcels/mount-parcel.js";
import { assign } from "../utils/assign.js";
import { isParcel, toName } from "../applications/app.helpers.js";
import { formatErrorMessage } from "../applications/app-errors.js";

/**
 * 得到传递给子应用的props
 * @param {} appOrParcel => app 
 * 以下返回内容其实在官网也都有提到，比如singleSpa实例，目的是为了子应用不需要重复引入single-spa
 * return {
 *    ...customProps,
 *    name,
 *    mountParcel: mountParcel.bind(appOrParcel),
 *    singleSpa, 
 * }
 */
export function getProps(appOrParcel) {
  // app.name
  const name = toName(appOrParcel);
  // app.customProps，以下对customProps对象的判断逻辑有点多余
  // 因为前面的参数格式化已经保证customProps肯定是一个对象
  let customProps =
    typeof appOrParcel.customProps === "function"
      ? appOrParcel.customProps(name, window.location)
      : appOrParcel.customProps;
  if (
    typeof customProps !== "object" ||
    customProps === null ||
    Array.isArray(customProps)
  ) {
    customProps = {};
    console.warn(
      formatErrorMessage(
        40,
        __DEV__ &&
          `single-spa: ${name}'s customProps function must return an object. Received ${customProps}`
      ),
      name,
      customProps
    );
  }

  const result = assign({}, customProps, {
    name,
    mountParcel: mountParcel.bind(appOrParcel),
    singleSpa,
  });

  if (isParcel(appOrParcel)) {
    result.unmountSelf = appOrParcel.unmountThisParcel;
  }

  return result;
}
