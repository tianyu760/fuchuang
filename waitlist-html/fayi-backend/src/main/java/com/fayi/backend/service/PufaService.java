package com.fayi.backend.service;

import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class PufaService {

    private static final Map<String, String> PERSONA_INTRO = new LinkedHashMap<>();
    private static final Map<String, List<Map<String, Object>>> BY_PERSONA = new LinkedHashMap<>();

    static {
        PERSONA_INTRO.put("life_consume", "您选择了「日常生活与消费维权」画像。购物、预付卡、服务质量与个人信息等纠纷中，下列法律规范常被援引，便于您建立基本认知。");
        PERSONA_INTRO.put("work_labor", "您选择了「劳动就业与职场」画像。工资、工时、解除与工伤等议题与下列制度密切相关，可作为查阅线索。");
        PERSONA_INTRO.put("rent_housing", "您选择了「租房与房屋居住」画像。租赁合同、押金、维修义务与居住安全等问题，可对照下列规定建立框架。");
        PERSONA_INTRO.put("traffic", "您选择了「道路交通与出行」画像。交通事故责任、保险理赔与违章处理等，常与下列规范相关联。");
        PERSONA_INTRO.put("minor_elder", "您选择了「未成年人与老年人照护」画像。监护、教育与赡养、养老机构服务等场景，可关注下列法律要点。");
        PERSONA_INTRO.put("startup_micro", "您选择了「小微主体与开店经营」画像。市场主体登记、合同、用工与税务合规等，下列法规常被用到。");

        BY_PERSONA.put("life_consume", List.of(
            buildItem("网络购物与七日无理由退货",
                "了解经营者义务与例外商品，有助于处理电商纠纷。",
                List.of("《中华人民共和国消费者权益保护法》第二十五条（无理由退货）", "《民法典》合同编关于买卖合同与违约责任的一般规定")),
            buildItem("预付式消费与退款",
                "健身、教培、美容等预付卡纠纷中，可对照格式条款与违约责任条款。",
                List.of("《消费者权益保护法》第五十三条（预收款经营者义务）", "《民法典》第四百九十六条（格式条款提示说明义务）")),
            buildItem("产品缺陷与人身损害",
                "因商品缺陷受伤的，可了解生产者与销售者的责任分担思路。",
                List.of("《民法典》第一千二百零二条至第一千二百零三条（产品责任）", "《产品质量法》关于缺陷产品的相关规定"))
        ));

        BY_PERSONA.put("work_labor", List.of(
            buildItem("工资支付与加班",
                "明确工资支付周期、加班工资计算的法律依据，便于留存证据与主张权利。",
                List.of("《中华人民共和国劳动法》第四十四条（加班工资）", "《工资支付暂行规定》")),
            buildItem("劳动合同的订立与解除",
                "试用期、解除条件与经济补偿是劳动争议中的高频问题。",
                List.of("《中华人民共和国劳动合同法》第十九条、第三十六条至第四十一条", "《劳动合同法实施条例》")),
            buildItem("工伤保险与认定",
                "工作中发生事故伤害时，工伤认定与待遇支付有专门程序。",
                List.of("《工伤保险条例》", "《工伤认定办法》（程序性规定）"))
        ));

        BY_PERSONA.put("rent_housing", List.of(
            buildItem("房屋租赁合同主要内容",
                "租金、租期、维修义务、转租与押金条款宜书面明确，减少争议。",
                List.of("《民法典》第七百零四条（租赁合同内容）", "第七百一十一条至第七百一十七条（承租人义务、维修等）")),
            buildItem("买卖不破租赁",
                "租赁期间房屋所有权变动的，在符合条件时租赁关系可对抗新业主。",
                List.of("《民法典》第七百二十五条")),
            buildItem("群租与居住安全",
                "地方对房屋出租安全、最小居住面积等常有细化规定，可结合所在地查询。",
                List.of("《商品房屋租赁管理办法》（住房和城乡建设部）", "所在地房屋租赁与安全管理条例"))
        ));

        BY_PERSONA.put("traffic", List.of(
            buildItem("道路交通事故处理",
                "报警、勘验、责任认定与调解程序，是后续理赔与诉讼的基础。",
                List.of("《中华人民共和国道路交通安全法》第七十条", "《道路交通事故处理程序规定》")),
            buildItem("机动车交通事故责任",
                "交强险、商业险与侵权责任的承担顺序，是索赔时的核心结构。",
                List.of("《民法典》第一千二百零八条至第一千二百一十三条", "《机动车交通事故责任强制保险条例》")),
            buildItem("违章与记分",
                "行政处罚与记分规则由行政法规与部门规章规定，宜以最新文本为准。",
                List.of("《中华人民共和国道路交通安全法实施条例》", "《道路交通安全违法行为记分管理办法》"))
        ));

        BY_PERSONA.put("minor_elder", List.of(
            buildItem("未成年人监护与网络保护",
                "家长、学校与平台在未成年人网络行为中的责任边界日益清晰。",
                List.of("《中华人民共和国民法典》第二十六条、第二十七条（监护）", "《未成年人保护法》第五章（网络保护）")),
            buildItem("老年人权益保障",
                "赡养、居住权与养老服务中的权利义务，可对照专门章节。",
                List.of("《中华人民共和国老年人权益保障法》", "《民法典》第三百六十六条起（居住权）")),
            buildItem("家庭教育促进",
                "家庭教育的国家支持与社会协同机制有专门立法。",
                List.of("《中华人民共和国家庭教育促进法》"))
        ));

        BY_PERSONA.put("startup_micro", List.of(
            buildItem("市场主体登记",
                "个体工商户与小微企业的设立、变更与注销，以登记制度为基础。",
                List.of("《中华人民共和国市场主体登记管理条例》")),
            buildItem("合同订立与履行",
                "对外经营中的订单、服务协议与违约责任，适用合同编一般规则。",
                List.of("《民法典》合同编通则", "典型合同分编（买卖、服务等）")),
            buildItem("劳动用工合规",
                "雇工即可能构成劳动关系或非全日制用工，需区分适用法律关系。",
                List.of("《劳动合同法》第十条、第六十八条等", "《保障农民工工资支付条例》（如涉及工程建设）"))
        ));
    }

    private static Map<String, Object> buildItem(String title, String why, List<String> laws) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("title", title);
        item.put("why", why);
        item.put("laws", laws);
        return item;
    }

    public Map<String, Object> getRecommendations(String persona) {
        String p = (persona != null && BY_PERSONA.containsKey(persona)) ? persona : "life_consume";
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("persona", p);
        result.put("intro", PERSONA_INTRO.get(p));
        result.put("items", BY_PERSONA.get(p));
        return result;
    }
}
