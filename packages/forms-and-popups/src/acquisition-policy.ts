export function shouldSuppressKnownCustomerIncentive(input:{isNewSubscriber:boolean;hasRecentOrder:boolean;allowKnownCustomers?:boolean}){
 if(input.allowKnownCustomers)return {allowed:true,reason:null};
 if(!input.isNewSubscriber)return {allowed:false,reason:"already_subscribed"};
 if(input.hasRecentOrder)return {allowed:false,reason:"recent_customer"};
 return {allowed:true,reason:null};
}
